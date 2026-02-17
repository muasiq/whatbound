# 📨 WhatsApp Outbound Messenger

A self-hosted solution to send bulk WhatsApp messages to a list of contacts via WhatsApp Web. Upload contacts (CSV or manual entry), compose a personalised message, and send — all from a clean web UI.

---

## Features

- **QR-based WhatsApp login** — scan once, session persists across restarts
- **CSV upload** or **manual entry** for contacts (phone, name, company)
- **Message personalisation** — use `{{name}}`, `{{company}}`, `{{phone}}` placeholders
- **Real-time progress** — live send progress via WebSocket
- **Number validation** — checks if a number is registered on WhatsApp before sending
- **Rate-limit friendly** — configurable delay between messages
- **Abort support** — stop a send job at any time
- **Dark mode UI** — sleek, modern interface

---

## Prerequisites

- **Node.js ≥ 18**
- **Google Chrome / Chromium** (used internally by Puppeteer for WhatsApp Web)
- A WhatsApp account linked to a phone

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open the UI
open http://localhost:3000
```

On first launch the server starts a headless Chrome instance and connects to WhatsApp Web. You'll see a QR code in the UI — scan it with your phone (**WhatsApp → Settings → Linked Devices → Link a Device**).

Once authenticated, the session is saved locally in `.wwebjs_auth/` so you won't need to scan again.

---

## How to Use

### 1. Connect WhatsApp
Open `http://localhost:3000` and scan the QR code with your phone.

### 2. Add Contacts
**Option A — CSV Upload**
Upload a `.csv` file with columns: `phone`, `name`, `company`.
A sample CSV is available for download in the UI.

**Option B — Manual Entry**
Type one contact per line: `phone, name, company` (name and company are optional).

### 3. Compose & Send
Write your message. Use placeholders:
- `{{name}}` — replaced with the contact's name
- `{{company}}` — replaced with the company name
- `{{phone}}` — replaced with the phone number

Set the delay between messages (default 3 seconds) and hit **Send Messages**.

### 4. Monitor Progress
Watch real-time delivery status for each contact. You can abort mid-way if needed.

---

## CSV Format

| phone         | name         | company        |
|---------------|--------------|----------------|
| 919876543210  | Rahul Sharma | TechCorp India |
| 447911123456  | Jane Smith   | Globex Ltd     |

- Phone numbers should include the country code (no `+` or spaces needed, but they're stripped automatically)
- Column names are case-insensitive. Aliases accepted: `number`, `mobile`, `person name`, `company name`, etc.

---

## API Endpoints

| Method | Endpoint          | Description                      |
|--------|-------------------|----------------------------------|
| GET    | `/api/status`     | Current connection status        |
| POST   | `/api/upload-csv` | Upload & parse a CSV file        |
| POST   | `/api/send`       | Start sending messages           |
| POST   | `/api/abort`      | Abort current send job           |
| GET    | `/api/log`        | Get message send log             |
| POST   | `/api/logout`     | Disconnect & clear session       |

---

## Configuration

| Env Variable | Default | Description           |
|-------------|---------|------------------------|
| `PORT`      | `3000`  | Server port            |

---

## ⚠️ Important Notes

1. **This uses WhatsApp Web, not the official Business API.** Use responsibly and at your own risk.
2. Sending too many messages too fast may result in your number being temporarily or permanently banned by WhatsApp.
3. Recommended: keep delay at **3–5 seconds** or higher. Don't send to more than ~200 contacts in a session.
4. This tool is intended for legitimate business communication, not spam.

---

## Project Structure

```
whatsapp-outbound/
├── src/
│   ├── server.js        # Express + Socket.IO server
│   └── whatsapp.js      # WhatsApp Web client service
├── public/
│   ├── index.html       # Web UI
│   ├── style.css        # Styles
│   ├── app.js           # Frontend logic
│   └── sample-contacts.csv
├── package.json
└── README.md
```

---

## License

MIT
