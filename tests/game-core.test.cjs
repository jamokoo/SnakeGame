const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createGame, step, getBoard } = require("../game-core.js");

function game(snake, direction, apple = { x: 5, y: 5 }) {
  return { snake, direction, apple, score: 0, status: "running" };
}

test("starting apples never overlap the five-segment snake", () => {
  for (let i = 0; i < 100; i += 1) {
    const state = createGame(() => i / 100);
    assert.equal(state.snake.length, 5);
    assert.equal(state.direction, "up");
    assert.equal(state.snake.some((cell) => cell.x === state.apple.x && cell.y === state.apple.y), false);
  }
});

test("movement advances the head and removes the tail without mutating the previous state", () => {
  const state = createGame(() => 0);
  const before = structuredClone(state);
  const next = step(state);
  assert.deepEqual(next.snake[0], { x: 4, y: 3 });
  assert.deepEqual(next.snake.at(-1), { x: 4, y: 7 });
  assert.equal(next.snake.length, 5);
  assert.equal(next.score, 0);
  assert.deepEqual(state, before);
});

test("movement wraps around all four edges", () => {
  const cases = [
    ["left", [{ x: 0, y: 4 }, { x: 1, y: 4 }, { x: 2, y: 4 }], { x: 9, y: 4 }],
    ["right", [{ x: 9, y: 4 }, { x: 8, y: 4 }, { x: 7, y: 4 }], { x: 0, y: 4 }],
    ["up", [{ x: 4, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 }], { x: 4, y: 9 }],
    ["down", [{ x: 4, y: 9 }, { x: 4, y: 8 }, { x: 4, y: 7 }], { x: 4, y: 0 }],
  ];
  for (const [direction, snake, expected] of cases) {
    const next = step(game(snake, direction));
    assert.deepEqual(next.snake[0], expected, direction);
    assert.equal(next.status, "running");
  }
});

test("eating grows the snake, scores a point, and places the next apple outside it", () => {
  const state = { ...createGame(() => 0), apple: { x: 4, y: 3 } };
  for (const random of [() => 0, () => 0.5, () => 0.99999]) {
    const next = step(state, "up", random);
    assert.equal(next.score, 1);
    assert.equal(next.snake.length, 6);
    assert.deepEqual(next.snake.at(-1), state.snake.at(-1));
    assert.equal(next.snake.some((cell) => cell.x === next.apple.x && cell.y === next.apple.y), false);
  }
});

test("opposite-direction inputs keep moving forward in all four directions", () => {
  const cases = [
    ["up", "down", [{ x: 4, y: 4 }, { x: 4, y: 5 }, { x: 4, y: 6 }], { x: 4, y: 3 }],
    ["down", "up", [{ x: 4, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 2 }], { x: 4, y: 5 }],
    ["left", "right", [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], { x: 3, y: 4 }],
    ["right", "left", [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }], { x: 5, y: 4 }],
  ];
  for (const [direction, opposite, snake, expected] of cases) {
    const state = game(snake, direction, { x: 0, y: 0 });
    const next = step(state, opposite);
    assert.equal(next.status, "running", direction);
    assert.equal(next.direction, direction);
    assert.deepEqual(next.snake[0], expected);
    assert.equal(next.snake.length, state.snake.length);
    assert.equal(next.score, state.score);
    const repeated = step(next, opposite);
    assert.equal(repeated.status, "running");
    assert.equal(repeated.direction, direction);
    assert.notDeepEqual(repeated.snake[0], next.snake[0]);
  }
});

test("legal turns into the body or current tail still end the round", () => {
  const body = game(
    [{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 2 }],
    "right",
  );
  assert.equal(step(body, "down").status, "over");
  const loop = game(
    [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }],
    "up",
  );
  const lost = step(loop, "right");
  assert.equal(lost.status, "over");
  assert.equal(step(lost), lost);
});

test("eating the final free square wins without trying to generate another apple", () => {
  const cells = [];
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      cells.push({ x: y % 2 === 0 ? x : 9 - x, y });
    }
  }
  const state = { ...game(cells.slice(1), "left", cells[0]), score: 94 };
  const next = step(state, "left", () => { throw new Error("No randomness needed on a full board"); });
  assert.equal(next.status, "won");
  assert.equal(next.score, 95);
  assert.equal(next.snake.length, 100);
  assert.equal(next.apple, null);
  assert.equal(getBoard(next).flat().filter((sprite) => sprite === "empty").length, 0);
  assert.equal(step(next), next);
});

test("body corners and straight segments use the corresponding original sprites", () => {
  const center = { x: 5, y: 5 };
  const up = { x: 5, y: 4 };
  const down = { x: 5, y: 6 };
  const left = { x: 4, y: 5 };
  const right = { x: 6, y: 5 };
  const cases = [
    [up, down, "bodyVertical"],
    [left, right, "bodyHorizontal"],
    [down, left, "bodyBottomleft"],
    [down, right, "bodyBottomright"],
    [up, left, "bodyTopleft"],
    [up, right, "bodyTopright"],
  ];
  for (const [previous, next, sprite] of cases) {
    for (const snake of [[previous, center, next], [next, center, previous]]) {
      assert.equal(getBoard(game(snake, "up", { x: 0, y: 0 }))[5][5], sprite);
    }
  }
});

test("head, corners, and tail remain connected across wrapped edges", () => {
  const state = game(
    [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }, { x: 8, y: 9 }],
    "right",
  );
  const board = getBoard(state);
  assert.equal(board[0][0], "headRight");
  assert.equal(board[0][9], "bodyTopright");
  assert.equal(board[9][9], "bodyBottomleft");
  assert.equal(board[9][8], "tailRight");
  assert.equal(board[5][5], "apple");
});

test("manifest assets match their recorded sizes and hashes, with none duplicated", () => {
  const root = path.resolve(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets", "manifest.json"), "utf8"));
  const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
  const extractedHashes = new Set();
  for (const asset of manifest) {
    const bytes = fs.readFileSync(path.join(root, "assets", ...asset.file.split("/")));
    assert.equal(bytes.length, asset.bytes, asset.file);
    assert.equal(hash(bytes), asset.sha256, asset.file);
    assert.equal(extractedHashes.has(asset.sha256), false, `Duplicate: ${asset.file}`);
    extractedHashes.add(asset.sha256);
  }
});
