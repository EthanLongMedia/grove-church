// node --test test/
// The handler's core is a pure function: (payload, deps) -> {status, body}.
// `send` is injected so no test touches the network.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handle } = require("../api/contact.js");

const good = { name: "Ann Example", email: "ann@example.com", message: "Hello there." };
const sent = () => { const calls = []; return { calls, send: async (m) => { calls.push(m); return { ok: true }; } }; };
const env = { RESEND_API_KEY: "re_test" };

test("valid message is sent with reply-to set to the visitor", async () => {
  const s = sent();
  const r = await handle(good, { send: s.send, env });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(s.calls.length, 1);
  const m = s.calls[0];
  assert.equal(m.reply_to, "ann@example.com");
  assert.deepEqual(m.to, ["grovechapel200@gmail.com"]);
  assert.match(m.from, /noreply@grovechurchmidland\.org/);
  assert.equal(m.subject, "Message from Ann Example via the website");
  assert.match(m.text, /Hello there\.\n\n— Ann Example \(ann@example\.com\)/);
});

test("honeypot filled: says ok, sends nothing", async () => {
  const s = sent();
  const r = await handle({ ...good, website: "http://spam" }, { send: s.send, env });
  assert.equal(r.status, 200);
  assert.equal(s.calls.length, 0);
});

test("missing fields are 400 and nothing is sent", async () => {
  const s = sent();
  for (const bad of [{ ...good, name: "" }, { ...good, email: "not-an-email" }, { ...good, message: "   " }, {}]) {
    const r = await handle(bad, { send: s.send, env });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(r.body.ok, false);
  }
  assert.equal(s.calls.length, 0);
});

test("oversized fields are 400", async () => {
  const s = sent();
  const r = await handle({ ...good, message: "x".repeat(4001) }, { send: s.send, env });
  assert.equal(r.status, 400);
  assert.equal(s.calls.length, 0);
});

test("fields are trimmed and header-safe", async () => {
  const s = sent();
  await handle({ name: "  Ann\r\nBcc: x@y.z ", email: " ann@example.com ", message: " hi " }, { send: s.send, env });
  assert.equal(s.calls[0].subject, "Message from Ann Bcc: x@y.z via the website");
  assert.equal(s.calls[0].reply_to, "ann@example.com");
});

test("no API key configured: 503, nothing sent", async () => {
  const s = sent();
  const r = await handle(good, { send: s.send, env: {} });
  assert.equal(r.status, 503);
  assert.equal(s.calls.length, 0);
});

test("mail provider failure: 502", async () => {
  const r = await handle(good, { send: async () => { throw new Error("resend down"); }, env });
  assert.equal(r.status, 502);
  assert.equal(r.body.ok, false);
});

test("recipient can be overridden by env", async () => {
  const s = sent();
  await handle(good, { send: s.send, env: { ...env, CONTACT_TO: "other@example.org" } });
  assert.deepEqual(s.calls[0].to, ["other@example.org"]);
});
