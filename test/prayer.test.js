// node --test test/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handle } = require("../api/prayer.js");

const sent = () => { const calls = []; return { calls, send: async (m) => { calls.push(m); return { ok: true }; } }; };
const env = { RESEND_API_KEY: "re_test" };

test("anonymous request: sent with no name and no reply-to", async () => {
  const s = sent();
  const r = await handle({ request: "Please pray for my family." }, { send: s.send, env });
  assert.equal(r.status, 200);
  assert.equal(s.calls.length, 1);
  const m = s.calls[0];
  assert.deepEqual(m.to, ["grovechurchmidland@gmail.com"]);
  assert.equal(m.subject, "Prayer request (anonymous)");
  assert.equal(m.reply_to, undefined);
  assert.match(m.text, /^Please pray for my family\.\n\n— Shared anonymously/);
});

test("name and email are optional extras", async () => {
  const s = sent();
  await handle({ request: "Healing for my mom.", name: " Ann ", email: " ann@example.com " }, { send: s.send, env });
  const m = s.calls[0];
  assert.equal(m.subject, "Prayer request from Ann");
  assert.equal(m.reply_to, "ann@example.com");
  assert.match(m.text, /— From Ann via the website prayer page\.\nWould like a reply: ann@example\.com/);
});

test("empty request is 400, nothing sent", async () => {
  const s = sent();
  for (const bad of [{}, { request: "   " }, { name: "Ann" }]) {
    const r = await handle(bad, { send: s.send, env });
    assert.equal(r.status, 400);
  }
  assert.equal(s.calls.length, 0);
});

test("bad email is 400; blank email is fine", async () => {
  const s = sent();
  assert.equal((await handle({ request: "x", email: "nope" }, { send: s.send, env })).status, 400);
  assert.equal((await handle({ request: "x", email: "" }, { send: s.send, env })).status, 200);
});

test("too long is 400", async () => {
  const s = sent();
  const r = await handle({ request: "x".repeat(4001) }, { send: s.send, env });
  assert.equal(r.status, 400);
  assert.equal(s.calls.length, 0);
});

test("honeypot: ok, nothing sent", async () => {
  const s = sent();
  const r = await handle({ request: "spam", website: "http://x" }, { send: s.send, env });
  assert.equal(r.status, 200);
  assert.equal(s.calls.length, 0);
});

test("name is header-safe", async () => {
  const s = sent();
  await handle({ request: "x", name: "Ann\r\nBcc: x@y.z" }, { send: s.send, env });
  assert.equal(s.calls[0].subject, "Prayer request from Ann Bcc: x@y.z");
});

test("no key: 503; provider down: 502", async () => {
  assert.equal((await handle({ request: "x" }, { send: async () => {}, env: {} })).status, 503);
  assert.equal((await handle({ request: "x" }, { send: async () => { throw new Error("down"); }, env })).status, 502);
});

test("PRAYER_TO overrides the recipient", async () => {
  const s = sent();
  await handle({ request: "x" }, { send: s.send, env: { ...env, PRAYER_TO: "pastor@example.org" } });
  assert.deepEqual(s.calls[0].to, ["pastor@example.org"]);
});
