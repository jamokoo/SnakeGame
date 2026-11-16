(function () {
  "use strict";

  const { SIZE, TICK_MS, SPRITES, OPPOSITE_DIRECTIONS, createGame, step, getBoard } = window.SnakeGame;
  const layoutButton = document.getElementById("layout");
  const board = document.getElementById("board");
  const stage = document.getElementById("stage");
  const titleScreen = document.getElementById("title-screen");
  const resultScreen = document.getElementById("result-screen");
  const startButton = document.getElementById("start");
  const stopButton = document.getElementById("stop");
  const scoreDisplay = document.getElementById("score");
  const highScoreDisplay = document.getElementById("high-score");
  const highScoreLabel = document.getElementById("high-score-label");
  const status = document.getElementById("status");
  const notice = document.getElementById("notice");
  const directionButtons = [...document.querySelectorAll("[data-direction]")];
  const storageKey = "iot-ticket-snake-high-score";
  const music = new Audio();
  const eatSound = new Audio("assets/audio/eat.mp3");
  const deathSound = new Audio("assets/audio/death.mp3");
  const audioRequests = new Map();
  music.preload = "none";
  eatSound.preload = "none";
  deathSound.preload = "none";
  let soundEnabled = true;
  let highScore = 0;
  let sharedHighScore = null;
  let pendingSharedScore = 0;
  let submittingSharedScore = false;
  let lastQueuedRoundScore = 0;
  let storageAvailable = true;
  let ready = false;
  let state = null;
  let direction = "up";
  let clock = null;
  let swipeStart = null;

  function report(message, error) {
    console.error(message, error);
    notice.textContent = message;
    notice.hidden = false;
  }

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) {
      highScore = Number(saved);
      if (saved.trim() === "" || !Number.isSafeInteger(highScore) || highScore < 0) {
        throw new Error("The stored hi-score is not a non-negative integer");
      }
    }
  } catch (error) {
    highScore = 0;
    storageAvailable = false;
    report("Hi-score storage is unavailable or invalid. You can still play, but your hi-score will not be saved.", error);
  }
  highScoreDisplay.textContent = highScore;

  const sharedUrl = document.querySelector('meta[name="shared-score-url"]').content.trim();
  const sharedScore = sharedUrl ? window.createSharedScore(sharedUrl) : null;

  function displayHighScore() {
    highScoreLabel.textContent = sharedHighScore === null ? "Hi-Score" : "Shared";
    highScoreDisplay.textContent = sharedHighScore === null ? highScore : sharedHighScore;
  }

  function sharedScoreFailed(error) {
    sharedHighScore = null;
    displayHighScore();
    report("Shared hi-score unavailable; showing your personal hi-score.", error);
  }

  function sharedScoreReceived(score) {
    sharedHighScore = Math.max(sharedHighScore ?? 0, score);
    displayHighScore();
    if (notice.textContent === "Shared hi-score unavailable; showing your personal hi-score.") {
      notice.hidden = true;
      notice.textContent = "";
    }
  }

  async function submitSharedScore() {
    if (submittingSharedScore || pendingSharedScore === 0) return;
    submittingSharedScore = true;
    try {
      while (pendingSharedScore > 0) {
        const score = pendingSharedScore;
        const result = await sharedScore.submit(score);
        sharedScoreReceived(result);
        if (pendingSharedScore <= score) pendingSharedScore = 0;
      }
    } catch (error) {
      sharedScoreFailed(error);
    } finally {
      submittingSharedScore = false;
    }
  }

  async function refreshSharedScore() {
    try {
      sharedScoreReceived(await sharedScore.read());
      if (state !== null && state.score > sharedHighScore) {
        pendingSharedScore = Math.max(pendingSharedScore, state.score);
      }
      submitSharedScore();
    } catch (error) {
      sharedScoreFailed(error);
    }
  }

  if (sharedScore) {
    refreshSharedScore();
    setInterval(refreshSharedScore, 30000);
  }

  function saveHighScore() {
    if (state.score > highScore) {
      highScore = state.score;
      displayHighScore();
      if (storageAvailable) {
        try {
          localStorage.setItem(storageKey, String(highScore));
        } catch (error) {
          storageAvailable = false;
          report("Your hi-score could not be saved. You can still play.", error);
        }
      }
    }
    if (sharedScore && state.score > lastQueuedRoundScore) {
      lastQueuedRoundScore = state.score;
      if (state.score <= (sharedHighScore ?? 0)) return;
      pendingSharedScore = Math.max(pendingSharedScore, state.score);
      submitSharedScore();
    }
  }

  function stopAudio(audio) {
    audioRequests.delete(audio);
    audio.pause();
    audio.currentTime = 0;
  }

  function playAudio(audio) {
    if (!soundEnabled) return;
    const request = {};
    audioRequests.set(audio, request);
    audio.play().catch((error) => {
      // Switching tracks intentionally cancels an outstanding play request.
      if (audioRequests.get(audio) !== request) return;
      soundEnabled = false;
      [music, eatSound, deathSound].forEach(stopAudio);
      report("Audio could not be played. Check your browser's sound permissions, then press Start to retry.", error);
    });
  }

  function playMusic(track, loop) {
    stopAudio(music);
    music.src = `assets/audio/${track}.mp3`;
    music.loop = loop;
    playAudio(music);
  }

  function spritePath(name) {
    return `assets/sprites/${name}.${name === "apple" || name === "empty" ? "svg" : "png"}`;
  }

  const tiles = Array.from({ length: SIZE * SIZE }, () => {
    const tile = document.createElement("img");
    tile.className = "tile";
    tile.alt = "";
    tile.draggable = false;
    board.append(tile);
    return tile;
  });

  function render() {
    getBoard(state).flat().forEach((sprite, index) => {
      if (tiles[index].dataset.sprite !== sprite) {
        tiles[index].src = spritePath(sprite);
        tiles[index].dataset.sprite = sprite;
      }
    });
    scoreDisplay.textContent = state.score;
    board.setAttribute("aria-label", `10 by 10 Snake board. Snake length ${state.snake.length}. Score ${state.score}.`);
    saveHighScore();
  }

  function updateControls() {
    const running = state !== null && state.status === "running";
    startButton.disabled = !ready || running;
    stopButton.disabled = !running;
    directionButtons.forEach((button) => { button.disabled = !running; });
  }

  function finishGame(stopped = false) {
    clearInterval(clock);
    clock = null;
    stopAudio(music);
    stopAudio(eatSound);
    const won = state.status === "won";
    resultScreen.dataset.outcome = state.status;
    document.getElementById("result-title").textContent = won ? "You filled the board!" : stopped ? "Round stopped" : "Game over";
    document.getElementById("result-art").src = `assets/images/${won ? "title" : "game-over"}.jpg`;
    document.getElementById("final-score").textContent = state.score;
    resultScreen.hidden = false;
    status.textContent = won ? "You win! Play again to start a new round." : "Press Start or Enter to play again.";
    if (!stopped && !won) playAudio(deathSound);
    updateControls();
    startButton.focus({ preventScroll: true });
  }

  function tick() {
    const previousScore = state.score;
    state = step(state, direction);
    // On collision the dashboard keeps the last valid board on screen.
    if (state.status === "over") {
      finishGame();
      return;
    }
    render();
    if (state.score > previousScore) {
      stopAudio(eatSound);
      playAudio(eatSound);
    }
    if (state.status === "won") finishGame();
  }

  function startGame() {
    if (!ready || (state !== null && state.status === "running")) return;
    clearInterval(clock);
    [music, eatSound, deathSound].forEach(stopAudio);
    soundEnabled = true;
    state = createGame();
    lastQueuedRoundScore = 0;
    direction = state.direction;
    swipeStart = null;
    titleScreen.hidden = true;
    resultScreen.hidden = true;
    render();
    updateControls();
    status.textContent = "Eat apples. Watch your tail!";
    playMusic("ingame", true);
    clock = setInterval(tick, TICK_MS);
    board.focus({ preventScroll: true });
  }

  function stopGame() {
    if (state === null || state.status !== "running") return;
    state = { ...state, status: "over" };
    finishGame(true);
  }

  function requestDirection(nextDirection) {
    if (state !== null && state.status === "running" && nextDirection !== OPPOSITE_DIRECTIONS[state.direction]) {
      direction = nextDirection;
    }
  }

  layoutButton.addEventListener("click", () => {
    const dashboard = document.body.dataset.layout !== "dashboard";
    document.body.dataset.layout = dashboard ? "dashboard" : "modern";
    const label = dashboard ? "Switch to modern layout" : "Switch to original dashboard layout";
    layoutButton.setAttribute("aria-label", label);
    layoutButton.setAttribute("aria-pressed", String(dashboard));
    layoutButton.title = label;
    swipeStart = null;
  });

  [startButton, titleScreen].forEach((button) => button.addEventListener("click", startGame));
  stopButton.addEventListener("click", stopGame);
  directionButtons.forEach((button) => {
    button.addEventListener("click", () => requestDirection(button.dataset.direction));
  });

  const keys = {
    ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left",
    w: "up", d: "right", s: "down", a: "left",
  };
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest("input, textarea, select")) return;
    const nextDirection = keys[event.key] || keys[event.key.toLowerCase()];
    if (nextDirection && state !== null && state.status === "running") {
      event.preventDefault();
      requestDirection(nextDirection);
    } else if (event.key === "Escape") {
      stopGame();
    } else if (event.key === "Enter" && !event.repeat && !event.target.closest("button")) {
      event.preventDefault();
      startGame();
    }
  });

  board.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || state === null || state.status !== "running") return;
    swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    board.setPointerCapture(event.pointerId);
  });
  board.addEventListener("pointerup", (event) => {
    if (swipeStart === null || swipeStart.id !== event.pointerId) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    requestDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  });
  board.addEventListener("pointercancel", () => { swipeStart = null; });

  Promise.all(SPRITES.map((sprite) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = () => reject(new Error(`Could not load ${spritePath(sprite)}`));
    image.src = spritePath(sprite);
  }))).then(() => {
    ready = true;
    stage.setAttribute("aria-busy", "false");
    titleScreen.disabled = false;
    updateControls();
    status.textContent = "Press Start or Enter to play.";
  }).catch((error) => {
    stage.setAttribute("aria-busy", "false");
    status.textContent = "Game assets could not be loaded.";
    report("Some game images are missing. Check that the assets folder is next to index.html, then reload.", error);
  });
})();
