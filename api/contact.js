// POST /api/contact — delivers the contact form to the church's inbox.
//
// A Vercel Node function with no dependencies: `fetch` is built in, so
// the project stays a static site with no package.json. Mail goes out
// through Resend from noreply@grovechurchmidland.org with Reply-To set
// to the visitor, so replying from Gmail goes straight back to them.
//
// Needs RESEND_API_KEY in the project's environment. Optional:
// CONTACT_TO (default grovechapel200@gmail.com) and CONTACT_FROM.
//
// The core is a pure function so it can be tested without the network:
// handle(payload, {send, env}) -> {status, body}.

const DEFAULT_TO   = "grovechapel200@gmail.com";
const DEFAULT_FROM = "Grove Church Midland <noreply@grovechurchmidland.org>";
const LIMITS = { name: 120, email: 254, message: 4000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One line, no CR/LF: nothing a visitor types may become a mail header.
function line(v, max) {
  return String(v == null ? "" : v).replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

async function handle(payload, { send, env }) {
  const p = payload && typeof payload === "object" ? payload : {};

  // Honeypot: a hidden field real visitors never see. Bots fill it.
  // Say "ok" so they don't learn anything, and send nothing.
  if (line(p.website, 10)) return { status: 200, body: { ok: true } };

  const name    = line(p.name, LIMITS.name);
  const email   = line(p.email, LIMITS.email);
  const message = String(p.message == null ? "" : p.message).trim();

  if (!name || !EMAIL.test(email) || !message) {
    return { status: 400, body: { ok: false, error: "Add your name, a valid email and a message." } };
  }
  if (message.length > LIMITS.message) {
    return { status: 400, body: { ok: false, error: "That message is too long — 4000 characters at most." } };
  }
  if (!env.RESEND_API_KEY) {
    return { status: 503, body: { ok: false, error: "Mail is not configured yet." } };
  }

  try {
    await send({
      from: env.CONTACT_FROM || DEFAULT_FROM,
      to: [env.CONTACT_TO || DEFAULT_TO],
      reply_to: email,
      subject: `Message from ${name} via the website`,
      text: `${message}\n\n— ${name} (${email})`,
    });
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
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json();
}

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST only." });
  }
  // Vercel parses JSON bodies; be defensive about a raw string anyway.
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
