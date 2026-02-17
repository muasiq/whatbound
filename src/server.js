const express = require("express");
const http = require("http");
const { Server: SocketIO } = require("socket.io");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const path = require("path");
const fs = require("fs");
const WhatsAppService = require("./whatsapp");

// ── Setup ────────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new SocketIO(server);
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const wa = new WhatsAppService();

// ── WhatsApp ↔ Socket.IO bridge ──────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("🌐 UI connected via Socket.IO");

  // Send current status immediately
  socket.emit("status", wa.getStatus());

  socket.on("disconnect", () => console.log("🌐 UI disconnected"));
});

// Forward WhatsApp events to all connected UIs
wa.on("qr", (qr) => io.emit("qr", qr));
wa.on("ready", () => io.emit("status", { isReady: true, hasQR: false }));
wa.on("authenticated", () => io.emit("authenticated"));
wa.on("auth_failure", (msg) => io.emit("auth_failure", msg));
wa.on("disconnected", (reason) => io.emit("disconnected", reason));
wa.on("send_start", (data) => io.emit("send_start", data));
wa.on("send_progress", (data) => io.emit("send_progress", data));
wa.on("send_complete", (data) => io.emit("send_complete", data));
wa.on("send_aborted", (data) => io.emit("send_aborted", data));

// ── REST API ─────────────────────────────────────────────────────────────────

/** GET /api/status */
app.get("/api/status", (_req, res) => {
  res.json(wa.getStatus());
});

/** POST /api/upload-csv  →  parse CSV and return contacts */
app.post("/api/upload-csv", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const content = req.file.buffer.toString("utf-8");
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    // Normalise column names (case‑insensitive)
    const contacts = records.map((r) => {
      const row = {};
      for (const [key, val] of Object.entries(r)) {
        row[key.toLowerCase().trim()] = val;
      }
      return {
        phone: row.phone || row.number || row.mobile || row["phone number"] || "",
        name: row.name || row["person name"] || row["contact name"] || "",
        company: row.company || row["company name"] || row.organisation || row.organization || "",
      };
    });

    // Filter out rows without a phone number
    const valid = contacts.filter((c) => c.phone);
    res.json({ total: records.length, valid: valid.length, contacts: valid });
  } catch (err) {
    res.status(400).json({ error: "Failed to parse CSV: " + err.message });
  }
});

/** POST /api/send  →  start sending messages */
app.post("/api/send", async (req, res) => {
  try {
    const { contacts, message, delay } = req.body;

    if (!contacts?.length) return res.status(400).json({ error: "No contacts provided" });
    if (!message?.trim()) return res.status(400).json({ error: "Message is required" });

    // Kick off the send job in the background
    const delayMs = Math.max(Number(delay) || 3000, 1000);
    wa.sendBulk(contacts, message, delayMs).catch((err) =>
      console.error("Send job error:", err)
    );

    res.json({ ok: true, message: `Sending to ${contacts.length} contacts…` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/abort  →  stop current send job */
app.post("/api/abort", (_req, res) => {
  wa.abort();
  res.json({ ok: true });
});

/** GET /api/log  →  get message send log */
app.get("/api/log", (_req, res) => {
  res.json(wa.messageLog);
});

/** POST /api/logout  →  disconnect WhatsApp session */
app.post("/api/logout", async (_req, res) => {
  try {
    await wa.destroy();
    // Remove stored session
    const authDir = path.join(__dirname, "..", ".wwebjs_auth");
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }
    res.json({ ok: true, message: "Logged out. Restart the server to reconnect." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  console.log(`\n🚀 WhatsApp Outbound server running at http://localhost:${PORT}\n`);
  try {
    await wa.init();
  } catch (err) {
    console.error("Failed to initialise WhatsApp client:", err);
  }
});
