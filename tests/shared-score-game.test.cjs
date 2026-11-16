const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createSharedScore } = require("../shared-score.js");

async function loadGame(request, sharedUrl = "https://example.test/", playAudio = () => Promise.resolve(), step = (state) => ({ ...state, score: 11 })) {
  const elements = new Map();
  const audio = [];
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id, dataset: {}, hidden: false, textContent: "", listeners: {}, attributes: {},
        addEventListener(type, callback) { this.listeners[type] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; }, append() {}, focus() {},
        showModal() { this.open = true; }, close() { this.open = false; },
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
        step,
        getBoard: () => [["empty"]],
      },
      createSharedScore: (url) => createSharedScore(url, request),
    },
    document: {
      body: { dataset: { layout: "modern" } },
      getElementById: element,
      querySelector: () => ({ content: sharedUrl }),
      querySelectorAll: () => [],
      createElement: () => element("tile"),
      addEventListener() {},
    },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    Audio: class {
      constructor(src = "") { this.src = src; this.paused = true; this.muted = false; this.listeners = {}; audio.push(this); }
      addEventListener(type, callback) { this.listeners[type] = callback; }
      pause() { this.paused = true; if (this.listeners.pause) this.listeners.pause(); }
      play() { this.paused = false; return playAudio(this); }
    },
    setInterval: (callback, delay) => { timers.set(delay, callback); return delay; },
    clearInterval() {},
    console: { error() {} },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../game.js"), "utf8"), context);
  await new Promise(setImmediate);
  return { element, timers, storage, audio };
}

test("game only fetches on load and round end and submits the final score", async () => {
  const requests = [];
  const app = await loadGame(async (url, options) => {
    requests.push(options);
    return Response.json({ score: options.method === "POST" ? 11 : 10 });
  });
  assert.equal(app.element("high-score-label").textContent, "Hi-Score");
  assert.equal(app.element("high-score").textContent, 10);
  assert.equal(requests.length, 1);
  assert.equal(app.timers.has(30000), false);
  app.element("initialize-button").listeners.click();
  app.element("start").listeners.click();
  app.timers.get(500)();
  await new Promise(setImmediate);
  assert.equal(app.storage.get("iot-ticket-snake-high-score"), "11");
  assert.equal(app.element("high-score").textContent, 10);
  assert.equal(requests.length, 1);
  app.timers.get(500)();
  await new Promise(setImmediate);
  assert.equal(requests.length, 1);
  app.element("stop").listeners.click();
  await new Promise(setImmediate);
  assert.equal(app.element("high-score").textContent, 11);
  assert.deepEqual(requests.map((request) => request.method || "GET"), ["GET", "GET", "POST"]);
  assert.deepEqual(JSON.parse(requests[2].body), { score: 11 });
});

test("game refreshes the shared score on collision and win", async () => {
  for (const outcome of ["over", "won"]) {
    const requests = [];
    const app = await loadGame(async (url, options) => {
      requests.push(options);
      return Response.json({ score: 10 });
    }, "https://example.test/", undefined, (state) => ({ ...state, status: outcome, score: 5 }));
    app.element("initialize-button").listeners.click();
    app.element("start").listeners.click();
    app.timers.get(500)();
    await new Promise(setImmediate);
    assert.deepEqual(requests.map((request) => request.method || "GET"), ["GET", "GET"]);
  }
});

test("a delayed initial read does not submit a score during a round", async () => {
  let resolveRead;
  const requests = [];
  const app = await loadGame((url, options) => {
    requests.push(options);
    return new Promise((resolve) => { resolveRead = resolve; });
  });
  app.element("initialize-button").listeners.click();
  app.element("start").listeners.click();
  app.timers.get(500)();
  resolveRead(Response.json({ score: 0 }));
  await new Promise(setImmediate);
  assert.deepEqual(requests.map((request) => request.method || "GET"), ["GET"]);
});

test("failed round score is retried at the next round end", async () => {
  const requests = [];
  let fail = true;
  const app = await loadGame(async (url, options) => {
    requests.push(options);
    if (options.method === "POST" && fail) {
      fail = false;
      throw new Error("offline");
    }
    return Response.json({ score: options.method === "POST" ? 11 : 10 });
  });
  app.element("initialize-button").listeners.click();
  app.element("start").listeners.click();
  app.timers.get(500)();
  app.element("stop").listeners.click();
  await new Promise(setImmediate);
  assert.match(app.element("notice").textContent, /unavailable/);
  app.element("start").listeners.click();
  app.element("stop").listeners.click();
  await new Promise(setImmediate);
  assert.deepEqual(requests.map((request) => request.method || "GET"), ["GET", "GET", "POST", "GET", "POST"]);
  assert.deepEqual(JSON.parse(requests[4].body), { score: 11 });
  assert.equal(app.element("high-score").textContent, 11);
  assert.equal(app.element("notice").hidden, true);
});

test("game shows its personal score and a warning when the shared service fails", async () => {
  const app = await loadGame(async () => { throw new Error("offline"); });
  assert.equal(app.element("high-score").textContent, 8);
  assert.equal(app.element("high-score-label").textContent, "Hi-Score Local");
  assert.match(app.element("notice").textContent, /unavailable/);
  assert.equal(app.element("notice").hidden, false);
});

test("game labels the personal score as local when no shared service is configured", async () => {
  const app = await loadGame(async () => {
    throw new Error("request should not be made without a service URL");
  }, "");
  assert.equal(app.element("high-score").textContent, 8);
  assert.equal(app.element("high-score-label").textContent, "Hi-Score Local");
});

test("initialization starts title music and a round switches to game music", async () => {
  const played = [];
  const app = await loadGame(async () => Response.json({ score: 0 }), "", (audio) => {
    played.push({ src: audio.src, loop: audio.loop });
    return Promise.resolve();
  });
  assert.equal(app.element("initialize").open, true);
  assert.equal(app.audio[0].src, "assets/audio/title_new.mp3");
  assert.equal(app.audio[0].preload, "auto");
  assert.equal(app.audio[1].preload, "auto");
  assert.equal(app.audio[2].preload, "auto");
  assert.deepEqual(played, []);
  let cancelled = false;
  app.element("initialize").listeners.cancel({ preventDefault() { cancelled = true; } });
  assert.equal(cancelled, true);
  app.element("start").listeners.click();
  assert.deepEqual(played, []);
  app.element("initialize-button").listeners.click();
  assert.equal(app.element("initialize").open, false);
  assert.deepEqual(played, [{ src: "assets/audio/title_new.mp3", loop: true }]);
  app.element("start").listeners.click();
  assert.deepEqual(played[1], { src: "assets/audio/ingame.mp3", loop: true });
});

test("initialization reports audio playback errors and allows starting a round", async () => {
  const app = await loadGame(async () => Response.json({ score: 0 }), "", () => Promise.reject(new Error("audio unavailable")));
  app.element("initialize-button").listeners.click();
  await new Promise(setImmediate);
  assert.equal(app.element("initialize").open, false);
  assert.match(app.element("notice").textContent, /Audio could not be played/);
  app.element("start").listeners.click();
  assert.equal(app.timers.has(500), true);
});

test("a late title playback rejection does not interrupt game music", async () => {
  let rejectTitle;
  const played = [];
  const app = await loadGame(async () => Response.json({ score: 0 }), "", (audio) => {
    played.push(audio.src);
    if (played.length === 1) return new Promise((resolve, reject) => { rejectTitle = reject; });
    return Promise.resolve();
  });
  app.element("initialize-button").listeners.click();
  app.element("start").listeners.click();
  rejectTitle(new Error("playback interrupted"));
  await new Promise(setImmediate);
  assert.deepEqual(played, ["assets/audio/title_new.mp3", "assets/audio/ingame.mp3"]);
  assert.notEqual(app.element("notice").textContent, "Audio could not be played. Check your browser's sound permissions, then press Start to retry.");
});

test("layout changes restart the matching title track only on the title screen", async () => {
  const played = [];
  let music;
  const app = await loadGame(async () => Response.json({ score: 0 }), "", (audio) => {
    music = audio;
    played.push({ src: audio.src, time: audio.currentTime });
    return Promise.resolve();
  });
  app.element("initialize-button").listeners.click();
  music.currentTime = 12;
  app.element("layout").listeners.click();
  music.currentTime = 34;
  app.element("layout").listeners.click();
  assert.deepEqual(played, [
    { src: "assets/audio/title_new.mp3", time: 0 },
    { src: "assets/audio/title.mp3", time: 0 },
    { src: "assets/audio/title_new.mp3", time: 0 },
  ]);
  app.element("start").listeners.click();
  app.element("layout").listeners.click();
  assert.equal(played.length, 4);
  assert.equal(played[3].src, "assets/audio/ingame.mp3");
  app.element("stop").listeners.click();
  app.element("layout").listeners.click();
  assert.equal(played.length, 4);
});

test("initialization plays the title track for the selected layout", async () => {
  const played = [];
  const app = await loadGame(async () => Response.json({ score: 0 }), "", (audio) => {
    played.push(audio.src);
    return Promise.resolve();
  });
  app.element("layout").listeners.click();
  assert.deepEqual(played, []);
  assert.equal(app.audio[0].src, "assets/audio/title.mp3");
  app.element("initialize-button").listeners.click();
  assert.deepEqual(played, ["assets/audio/title.mp3"]);
});

test("music mute persists across track changes without muting sound effects", async () => {
  const app = await loadGame(async () => Response.json({ score: 0 }), "");
  const music = app.audio[0];
  const button = app.element("music-mute");
  app.element("initialize-button").listeners.click();
  button.listeners.click();
  assert.equal(music.muted, true);
  assert.equal(music.paused, false);
  assert.equal(button.attributes["aria-pressed"], "true");
  assert.equal(button.title, "Unmute music");
  assert.equal(app.element("music-muted-mark").hidden, false);
  assert.equal(app.audio[1].muted, false);
  assert.equal(app.audio[2].muted, false);
  app.element("layout").listeners.click();
  assert.equal(music.muted, true);
  app.element("start").listeners.click();
  assert.equal(music.muted, true);
  button.listeners.click();
  assert.equal(music.muted, false);
  assert.equal(button.attributes["aria-pressed"], "false");
  assert.equal(button.title, "Mute music");
  assert.equal(app.element("music-muted-mark").hidden, true);
});

test("lyrics follow title playback and disappear outside the modern title screen", async () => {
  const app = await loadGame(async () => Response.json({ score: 0 }), "");
  const music = app.audio[0];
  const lyrics = app.element("title-lyrics");
  app.element("initialize-button").listeners.click();

  function at(time) {
    music.currentTime = time;
    music.listeners.timeupdate();
  }

  at(3.48);
  assert.equal(lyrics.hidden, true);
  at(3.49);
  assert.equal(lyrics.textContent, "IOT-Ticket Snake, slithering through the leaves,");
  assert.equal(lyrics.hidden, false);
  at(8.39);
  assert.equal(lyrics.textContent, "Looking for apples, under the jungle eaves.");
  at(63.96);
  assert.equal(lyrics.textContent, "But don't eat your tail, or it won't be long!");
  at(67.99);
  assert.equal(lyrics.hidden, false);
  at(68);
  assert.equal(lyrics.hidden, true);
  at(78);
  assert.equal(lyrics.hidden, true);
  at(0);
  assert.equal(lyrics.hidden, true);

  at(20.81);
  app.element("layout").listeners.click();
  assert.equal(lyrics.hidden, true);
  at(24.81);
  assert.equal(lyrics.hidden, true);
  app.element("layout").listeners.click();
  at(6.49);
  assert.equal(lyrics.hidden, false);
  music.pause();
  assert.equal(lyrics.hidden, true);
  music.play();
  music.listeners.playing();
  assert.equal(lyrics.hidden, false);
  app.element("start").listeners.click();
  assert.equal(lyrics.hidden, true);
  at(20.81);
  assert.equal(lyrics.hidden, true);
});
