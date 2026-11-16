const test = require("node:test");
const assert = require("node:assert/strict");
const { createSharedScore } = require("../shared-score.js");

test("shared score client reads and submits the API's score", async () => {
  const requests = [];
  const client = createSharedScore("https://example.test/", async (url, options) => {
    requests.push({ url, options });
    return Response.json({ score: 12 });
  });
  assert.equal(await client.read(), 12);
  assert.equal(await client.submit(12), 12);
  assert.deepEqual(JSON.parse(requests[1].options.body), { score: 12 });
  assert.equal(requests[1].options.method, "POST");
});

test("shared score client rejects HTTP and malformed responses", async () => {
  const failing = createSharedScore("https://example.test/", async () => new Response("", { status: 503 }));
  await assert.rejects(failing.read(), /503/);
  const malformed = createSharedScore("https://example.test/", async () => Response.json({ score: "10" }));
  await assert.rejects(malformed.read(), /invalid/);
});

test("worker retains the highest valid score and rejects invalid requests", async () => {
  const { HighScore, default: worker } = await import("../shared-score-worker.mjs");
  const data = new Map();
  const object = new HighScore({ storage: { kv: {
    get: (key) => data.get(key),
    put: (key, value) => data.set(key, value),
  } } });
  const env = { HIGH_SCORE: { getByName: () => object } };
  const send = (method, body) => worker.fetch(new Request("https://example.test/", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);

  assert.deepEqual(await (await send("GET")).json(), { score: 0 });
  const results = await Promise.all([send("POST", { score: 20 }), send("POST", { score: 7 })]);
  assert.equal(results[0].status, 200);
  assert.deepEqual(await (await send("GET")).json(), { score: 20 });
  for (const score of [-1, 96, 1.5, "21", null]) {
    assert.equal((await send("POST", { score })).status, 400);
  }
  assert.equal((await send("DELETE")).status, 405);
  assert.equal((await send("OPTIONS")).headers.get("Access-Control-Allow-Origin"), "*");
  assert.deepEqual(await (await send("GET")).json(), { score: 20 });
});
