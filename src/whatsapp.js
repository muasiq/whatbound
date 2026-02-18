const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const EventEmitter = require("events");

class WhatsAppService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isReady = false;
    this.qrCode = null;
    this.sendingInProgress = false;
    this.sendingAborted = false;
    this.messageLog = []; // { phone, name, status, error?, timestamp }
  }

  /** Initialise the WA Web client and wire up lifecycle events */
  async init() {
    if (this.client) return; // already initialised

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      },
    });

    this.client.on("qr", async (qr) => {
      this.qrCode = await qrcode.toDataURL(qr);
      this.isReady = false;
      this.emit("qr", this.qrCode);
      console.log("📱 QR code generated – scan with WhatsApp to authenticate");
    });

    this.client.on("ready", () => {
      this.isReady = true;
      this.qrCode = null;
      this.emit("ready");
      console.log("✅ WhatsApp client is ready");
    });

    this.client.on("authenticated", () => {
      console.log("🔐 WhatsApp authenticated");
      this.emit("authenticated");
    });

    this.client.on("auth_failure", (msg) => {
      console.error("❌ Auth failure:", msg);
      this.isReady = false;
      this.emit("auth_failure", msg);
    });

    this.client.on("disconnected", (reason) => {
      console.log("🔌 WhatsApp disconnected:", reason);
      this.isReady = false;
      this.qrCode = null;
      this.client = null;
      this.emit("disconnected", reason);
    });

    await this.client.initialize();
  }

  /** Get current connection status */
  getStatus() {
    return {
      isReady: this.isReady,
      hasQR: !!this.qrCode,
      qrCode: this.qrCode,
      sendingInProgress: this.sendingInProgress,
    };
  }

  /**
   * Format a phone number to the WhatsApp chat‑id format (E.164 without +).
   * Strips spaces, dashes, parens, and leading +.
   */
  _formatNumber(phone) {
    let cleaned = String(phone).replace(/[\s\-\(\)\+]/g, "");
    // If the number does not start with a country code, you can add a default here.
    // e.g. if (cleaned.length === 10) cleaned = '1' + cleaned; // US
    return cleaned;
  }

  /**
   * Replace {{name}} style placeholders in the message template.
   */
  _personalise(template, contact) {
    return template
      .replace(/\{\{\s*name\s*\}\}/gi, contact.name || "")
      .replace(/\{\{\s*company\s*\}\}/gi, contact.company || "")
      .replace(/\{\{\s*phone\s*\}\}/gi, contact.phone || "");
  }

  /**
   * Attempt to send a message to a single contact.
   * @private
   */
  async _sendToContact(chatId, targetId, message) {
    // Verify client is still available
    if (!this.client || !this.isReady) {
      throw new Error("WhatsApp client is not connected");
    }

    // Try to verify the number first
    try {
      const numberId = await this.client.getNumberId(chatId);
      if (!numberId) {
        throw new Error("Number not registered on WhatsApp");
      }
      targetId = numberId._serialized;
    } catch (checkErr) {
      // If getNumberId fails, try sending directly anyway
      console.warn("⚠️  Could not verify number, attempting to send directly:", checkErr.message);
      
      // Re-check client availability before retry
      if (!this.client || !this.isReady) {
        throw new Error("WhatsApp client is not connected");
      }
    }

    // Send the message
    await this.client.sendMessage(targetId, message);
  }

  /**
   * Send messages to a list of contacts.
   * @param {Array<{phone:string, name?:string, company?:string}>} contacts
   * @param {string} messageTemplate – may contain {{name}}, {{company}}, {{phone}}
   * @param {number} delayMs – delay between each message (ms), default 3 000
   */
  async sendBulk(contacts, messageTemplate, delayMs = 3000) {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");
    if (this.sendingInProgress) throw new Error("A send job is already in progress");

    this.sendingInProgress = true;
    this.sendingAborted = false;
    this.messageLog = [];

    const total = contacts.length;
    let sent = 0;
    let failed = 0;

    this.emit("send_start", { total });

    for (let i = 0; i < contacts.length; i++) {
      if (this.sendingAborted) {
        this.emit("send_aborted", { sent, failed, remaining: total - i });
        break;
      }

      const contact = contacts[i];
      const chatId = this._formatNumber(contact.phone) + "@c.us";
      const message = this._personalise(messageTemplate, contact);
      const entry = {
        index: i + 1,
        phone: contact.phone,
        name: contact.name || "",
        company: contact.company || "",
        status: "pending",
        timestamp: new Date().toISOString(),
      };

      try {
        await this._sendToContact(chatId, chatId, message);
        entry.status = "sent";
        sent++;
      } catch (err) {
        entry.status = "failed";
        entry.error = err.message;
        failed++;
      }

      this.messageLog.push(entry);
      this.emit("send_progress", { current: i + 1, total, sent, failed, entry });

      // Delay between messages to avoid rate‑limiting
      if (i < contacts.length - 1 && !this.sendingAborted) {
        await this._sleep(delayMs);
      }
    }

    this.sendingInProgress = false;
    this.emit("send_complete", { total, sent, failed, log: this.messageLog });
    return { total, sent, failed, log: this.messageLog };
  }

  /** Abort the current send job */
  abort() {
    this.sendingAborted = true;
  }

  /** Disconnect & cleanup */
  async destroy() {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      this.isReady = false;
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = WhatsAppService;
