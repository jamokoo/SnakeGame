(function () {
  "use strict";

  const SIZE = 10;
  const TICK_MS = 500;
  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
  };
  const OPPOSITE_DIRECTIONS = { up: "down", right: "left", down: "up", left: "right" };
  const SPRITES = [
    "apple", "headDown", "headLeft", "headUp", "headRight",
    "bodyVertical", "bodyHorizontal", "bodyBottomleft", "bodyBottomright",
    "bodyTopleft", "bodyTopright", "tailDown", "tailLeft", "tailUp", "tailRight", "empty",
  ];
  const BODY_SPRITES = {
    "down,up": "bodyVertical",
    "left,right": "bodyHorizontal",
    "down,left": "bodyBottomleft",
    "down,right": "bodyBottomright",
    "left,up": "bodyTopleft",
    "right,up": "bodyTopright",
  };

  function samePosition(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function placeApple(snake, random) {
    const empty = [];
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const cell = { x, y };
        if (!snake.some((segment) => samePosition(segment, cell))) empty.push(cell);
      }
    }
    return empty.length === 0 ? null : empty[Math.floor(random() * empty.length)];
  }

  function createGame(random = Math.random) {
    const snake = Array.from({ length: 5 }, (_, i) => ({ x: 4, y: 4 + i }));
    return { snake, apple: placeApple(snake, random), score: 0, direction: "up", status: "running" };
  }

  function step(state, direction = state.direction, random = Math.random) {
    if (state.status !== "running") return state;
    if (!Object.hasOwn(DIRECTIONS, direction)) throw new RangeError(`Unknown direction: ${direction}`);
    if (direction === OPPOSITE_DIRECTIONS[state.direction]) direction = state.direction;
    const delta = DIRECTIONS[direction];
    const head = {
      x: (state.snake[0].x + delta.x + SIZE) % SIZE,
      y: (state.snake[0].y + delta.y + SIZE) % SIZE,
    };
    // The dashboard checks collisions before removing the tail.
    if (state.snake.some((segment) => samePosition(segment, head))) {
      return { ...state, direction, status: "over" };
    }
    const ate = state.apple !== null && samePosition(head, state.apple);
    const snake = [head, ...state.snake];
    if (!ate) snake.pop();
    const apple = ate ? placeApple(snake, random) : state.apple;
    return {
      snake,
      apple,
      score: state.score + (ate ? 1 : 0),
      direction,
      status: apple === null ? "won" : "running",
    };
  }

  function relativePosition(current, other) {
    let dx = other.x - current.x;
    let dy = other.y - current.y;
    if (dx > SIZE / 2) dx -= SIZE;
    if (dx < -SIZE / 2) dx += SIZE;
    if (dy > SIZE / 2) dy -= SIZE;
    if (dy < -SIZE / 2) dy += SIZE;
    if (dx < 0) return "left";
    if (dx > 0) return "right";
    if (dy < 0) return "up";
    if (dy > 0) return "down";
    throw new Error("Overlapping snake segments cannot be rendered");
  }

  function getBoard(state) {
    const board = Array.from({ length: SIZE }, () => Array(SIZE).fill("empty"));
    const head = state.snake[0];
    board[head.y][head.x] = `head${state.direction[0].toUpperCase()}${state.direction.slice(1)}`;
    for (let i = 1; i < state.snake.length - 1; i += 1) {
      const current = state.snake[i];
      const sides = [
        relativePosition(current, state.snake[i - 1]),
        relativePosition(current, state.snake[i + 1]),
      ].sort().join(",");
      const sprite = BODY_SPRITES[sides];
      if (!sprite) throw new Error(`Invalid snake body connection: ${sides}`);
      board[current.y][current.x] = sprite;
    }
    const tail = state.snake[state.snake.length - 1];
    const tailDirection = relativePosition(tail, state.snake[state.snake.length - 2]);
    board[tail.y][tail.x] = `tail${tailDirection[0].toUpperCase()}${tailDirection.slice(1)}`;
    if (state.apple !== null) board[state.apple.y][state.apple.x] = "apple";
    return board;
  }

  const api = { SIZE, TICK_MS, SPRITES, OPPOSITE_DIRECTIONS, createGame, step, getBoard };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    window.SnakeGame = api;
  }
})();
