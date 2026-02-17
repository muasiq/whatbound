// ── State ─────────────────────────────────────────────────────────────────────
let contacts = [];
let isReady = false;

// ── Socket.IO ────────────────────────────────────────────────────────────────
const socket = io();

socket.on("connect", () => console.log("Socket connected"));

socket.on("status", (data) => {
  isReady = data.isReady;
  updateConnectionUI(data);
  toggleSections();
});

socket.on("qr", (qrDataUrl) => {
  document.getElementById("qr-spinner").style.display = "none";
  document.getElementById("qr-status").style.display = "none";
  const img = document.getElementById("qr-image");
  img.src = qrDataUrl;
  img.style.display = "block";
  document.getElementById("auth-ready").style.display = "none";
  setBadge("connecting");
});

socket.on("authenticated", () => {
  document.getElementById("qr-status").textContent = "Authenticated! Loading chats…";
});

socket.on("disconnected", () => {
  isReady = false;
  setBadge("disconnected");
  document.getElementById("qr-container").style.display = "block";
  document.getElementById("auth-ready").style.display = "none";
  document.getElementById("qr-image").style.display = "none";
  document.getElementById("qr-spinner").style.display = "block";
  document.getElementById("qr-status").style.display = "block";
  document.getElementById("qr-status").textContent = "Disconnected. Restart server to reconnect.";
  toggleSections();
});

socket.on("auth_failure", () => {
  setBadge("disconnected");
  document.getElementById("qr-status").textContent = "❌ Authentication failed. Restart server.";
});

// ── Send events ──────────────────────────────────────────────────────────────
socket.on("send_start", (data) => {
  document.getElementById("log-section").style.display = "block";
  document.getElementById("log-table").querySelector("tbody").innerHTML = "";
  document.getElementById("progress-bar").style.width = "0%";
  document.getElementById("progress-text").textContent = `0 / ${data.total}`;
  document.getElementById("stat-sent").textContent = "0";
  document.getElementById("stat-failed").textContent = "0";
  document.getElementById("send-btn").style.display = "none";
  document.getElementById("abort-btn").style.display = "inline-flex";
});

socket.on("send_progress", (data) => {
  const pct = Math.round((data.current / data.total) * 100);
  document.getElementById("progress-bar").style.width = pct + "%";
  document.getElementById("progress-text").textContent = `${data.current} / ${data.total}`;
  document.getElementById("stat-sent").textContent = data.sent;
  document.getElementById("stat-failed").textContent = data.failed;

  const e = data.entry;
  const tbody = document.getElementById("log-table").querySelector("tbody");
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${e.index}</td>
    <td>${esc(e.phone)}</td>
    <td>${esc(e.name)}</td>
    <td class="status-${e.status}">${e.status.toUpperCase()}</td>
    <td>${esc(e.error || "—")}</td>
    <td>${new Date(e.timestamp).toLocaleTimeString()}</td>
  `;
  tbody.appendChild(tr);
  tr.scrollIntoView({ behavior: "smooth", block: "end" });
});

socket.on("send_complete", (data) => {
  document.getElementById("send-btn").style.display = "inline-flex";
  document.getElementById("abort-btn").style.display = "none";
  document.getElementById("send-btn").disabled = false;
  alert(`✅ Done! Sent: ${data.sent}, Failed: ${data.failed}`);
});

socket.on("send_aborted", (data) => {
  document.getElementById("send-btn").style.display = "inline-flex";
  document.getElementById("abort-btn").style.display = "none";
  document.getElementById("send-btn").disabled = false;
  alert(`⛔ Aborted. Sent: ${data.sent}, Failed: ${data.failed}, Remaining: ${data.remaining}`);
});

// ── UI Helpers ────────────────────────────────────────────────────────────────
function setBadge(state) {
  const badge = document.getElementById("connection-badge");
  badge.className = "badge badge-" + state;
  badge.textContent = state === "ready" ? "Connected" : state === "connecting" ? "Connecting…" : "Disconnected";
}

function updateConnectionUI(data) {
  if (data.isReady) {
    setBadge("ready");
    document.getElementById("qr-container").style.display = "none";
    document.getElementById("auth-ready").style.display = "block";
  } else if (data.hasQR) {
    setBadge("connecting");
  } else {
    setBadge("disconnected");
  }
}

function toggleSections() {
  const contactsSec = document.getElementById("contacts-section");
  const sendSec = document.getElementById("send-section");

  if (isReady) {
    contactsSec.classList.remove("disabled-section");
  } else {
    contactsSec.classList.add("disabled-section");
  }

  if (isReady && contacts.length > 0) {
    sendSec.classList.remove("disabled-section");
  } else {
    sendSec.classList.add("disabled-section");
  }
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

// ── Contacts ─────────────────────────────────────────────────────────────────
function renderContacts() {
  const tbody = document.getElementById("contacts-table").querySelector("tbody");
  tbody.innerHTML = "";
  contacts.forEach((c, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${esc(c.phone)}</td>
      <td>${esc(c.name)}</td>
      <td>${esc(c.company)}</td>
      <td><button class="remove-btn" onclick="removeContact(${i})">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById("contact-count").textContent = contacts.length;
  document.getElementById("contacts-table-wrap").style.display = contacts.length ? "block" : "none";
  toggleSections();
}

function removeContact(index) {
  contacts.splice(index, 1);
  renderContacts();
}

function clearContacts() {
  contacts = [];
  renderContacts();
}

async function uploadCSV() {
  const fileInput = document.getElementById("csv-file");
  if (!fileInput.files.length) return alert("Please select a CSV file first.");

  const fd = new FormData();
  fd.append("file", fileInput.files[0]);

  try {
    const res = await fetch("/api/upload-csv", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    contacts = contacts.concat(data.contacts);
    renderContacts();
    alert(`Parsed ${data.valid} valid contacts from ${data.total} rows.`);
  } catch (err) {
    alert("CSV upload failed: " + err.message);
  }
}

function parseManual() {
  const text = document.getElementById("manual-contacts").value.trim();
  if (!text) return alert("Please enter at least one contact.");

  const lines = text.split("\n").filter((l) => l.trim());
  const newContacts = lines.map((line) => {
    const parts = line.split(",").map((s) => s.trim());
    return { phone: parts[0] || "", name: parts[1] || "", company: parts[2] || "" };
  }).filter((c) => c.phone);

  contacts = contacts.concat(newContacts);
  document.getElementById("manual-contacts").value = "";
  renderContacts();
}

// ── Sending ──────────────────────────────────────────────────────────────────
async function startSending() {
  const message = document.getElementById("message-template").value.trim();
  if (!message) return alert("Please enter a message.");
  if (!contacts.length) return alert("No contacts to send to.");

  const delay = Number(document.getElementById("send-delay").value) * 1000;

  document.getElementById("send-btn").disabled = true;

  try {
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts, message, delay }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
  } catch (err) {
    alert("Failed to start: " + err.message);
    document.getElementById("send-btn").disabled = false;
  }
}

async function abortSending() {
  if (!confirm("Abort the current send job?")) return;
  await fetch("/api/abort", { method: "POST" });
}

async function logout() {
  if (!confirm("Disconnect and logout from WhatsApp?")) return;
  await fetch("/api/logout", { method: "POST" });
  location.reload();
}
