// POST /api/prayer — delivers an anonymous prayer request to the church.
//
// Same shape as api/contact.js: no dependencies, mail through Resend,
// and a pure core (handle) so it is testable without the network.
//
// Anonymous by default. The only required field is the request itself;
// a first name and an email are optional, and nothing else about the
// visitor (no IP, no user agent) goes into the email. Reply-To is set
// only when they chose to leave an email, so a reply never goes
// anywhere they didn't ask for.
//
// Needs RESEND_API_KEY. Optional: PRAYER_TO (falls back to CONTACT_TO,
// then grovechurchmidland@gmail.com) and CONTACT_FROM.

const DEFAULT_TO   = "grovechurchmidland@gmail.com";
const DEFAULT_FROM = "Grove Church Midland <noreply@grovechurchmidland.org>";
const LIMITS = { name: 80, email: 254, request: 4000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One line, no CR/LF: nothing a visitor types may become a mail header.
function line(v, max) {
  return String(v == null ? "" : v).replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

async function handle(payload, { send, env }) {
  const p = payload && typeof payload === "object" ? payload : {};

  // Honeypot — see api/contact.js.
  if (line(p.website, 10)) return { status: 200, body: { ok: true } };

  const name    = line(p.name, LIMITS.name);
  const email   = line(p.email, LIMITS.email);
  const request = String(p.request == null ? "" : p.request).trim();

  if (!request) {
    return { status: 400, body: { ok: false, error: "Write your prayer request first." } };
  }
  if (request.length > LIMITS.request) {
    return { status: 400, body: { ok: false, error: "That request is too long — 4000 characters at most." } };
  }
  if (email && !EMAIL.test(email)) {
    return { status: 400, body: { ok: false, error: "That email doesn't look right — fix it or leave it blank." } };
  }
  if (!env.RESEND_API_KEY) {
    return { status: 503, body: { ok: false, error: "Mail is not configured yet." } };
  }

  const who = name ? `From ${name}` : "Shared anonymously";
  const reply = email ? `\nWould like a reply: ${email}` : "";

  const mail = {
    from: env.CONTACT_FROM || DEFAULT_FROM,
    to: [env.PRAYER_TO || env.CONTACT_TO || DEFAULT_TO],
    subject: name ? `Prayer request from ${name}` : "Prayer request (anonymous)",
    text: `${request}\n\n— ${who} via the website prayer page.${reply}`,
  };
  if (email) mail.reply_to = email;

  try {
    await send(mail);
  } catch (e) {
    return { status: 502, body: { ok: false, error: "Couldn't send just now." } };
  }
  return { status: 200, body: { ok: true } };
}

async function sendWithResend(mail, key) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(mail),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
  return r.json();
}

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST only." });
  }
  let payload = req.body;
  if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { payload = {}; } }

  const { status, body } = await handle(payload, {
    env: process.env,
    send: (mail) => sendWithResend(mail, process.env.RESEND_API_KEY),
  });
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
};
module.exports.handle = handle;
