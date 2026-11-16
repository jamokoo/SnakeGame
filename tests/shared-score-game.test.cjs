const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createSharedScore } = require("../shared-score.js");

async function loadGame(request) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id, dataset: {}, hidden: false, textContent: "", listeners: {},
        addEventListener(type, callback) { this.listeners[type] = callback; },
        setAttribute() {}, append() {}, focus() {},
      });
    }
    return elements.get(id);
  }
  const timers = new Map();
  const storage = new Map([["iot-ticket-snake-high-score", "8"]]);
  const gameState = { snake: [{ x: 0, y: 0 }], score: 0, direction: "up", status: "running" };
  const context = {
    window: {
      SnakeGame: {
        SIZE: 1, TICK_MS: 500, SPRITES: [], OPPOSITE_DIRECTIONS: {},
        createGame: () => ({ ...gameState }),
        step: (state) => ({ ...state, score: 11 }),
        getBoard: () => [["empty"]],
      },
      createSharedScore: (url) => createSharedScore(url, request),
    },
    document: {
      body: { dataset: { layout: "modern" } },
      getElementById: element,
      querySelector: () => ({ content: "https://example.test/" }),
      querySelectorAll: () => [],
      createElement: () => element("tile"),
      addEventListener() {},
    },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    Audio: class { pause() {} play() { return Promise.resolve(); } },
    setInterval: (callback, delay) => { timers.set(delay, callback); return delay; },
    clearInterval() {},
    console: { error() {} },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../game.js"), "utf8"), context);
  await new Promise(setImmediate);
  return { element, timers, storage };
}

test("game displays and submits shared scores without losing the personal score", async () => {
  const requests = [];
  const app = await loadGame(async (url, options) => {
    requests.push(options);
    return Response.json({ score: options.method === "POST" ? 11 : 10 });
  });
  assert.equal(app.element("high-score-label").textContent, "Shared");
  assert.equal(app.element("high-score").textContent, 10);
  app.element("start").listeners.click();
  app.timers.get(500)();
  await new Promise(setImmediate);
  assert.equal(app.element("high-score").textContent, 11);
  assert.equal(app.storage.get("iot-ticket-snake-high-score"), "11");
  assert.deepEqual(JSON.parse(requests.find((request) => request.method === "POST").body), { score: 11 });
  app.timers.get(500)();
  await new Promise(setImmediate);
  assert.equal(requests.filter((request) => request.method === "POST").length, 1);
});

test("game shows its personal score and a warning when the shared service fails", async () => {
  const app = await loadGame(async () => { throw new Error("offline"); });
  assert.equal(app.element("high-score").textContent, 8);
  assert.equal(app.element("high-score-label").textContent, "Hi-Score");
  assert.match(app.element("notice").textContent, /unavailable/);
  assert.equal(app.element("notice").hidden, false);
});
