# IoT-Ticket Snake

A standalone, static version of the original Lof 2024 IoT-Ticket dashboard game.
No IoT-Ticket installation, dependencies, or build step is needed to play locally.
An optional Cloudflare Worker provides a shared hi-score.

## Play locally

Open [index.html](index.html) in a modern browser. Keep the JavaScript, CSS, and
[assets](assets) folder alongside it. Select the opening overlay to hear the
title music, then start a round to play. Use the speaker button to mute music
without muting sound effects, or your browser's tab/site mute control to
silence all audio.
Warnings can be dismissed by selecting them. If audio fails, starting a
new round retries playback; reloading the page can also help.

The modern, rounded-card layout opens by default, without extra headings or
instructions. The small layout icon in the top-right corner switches between
this look and the original dashboard arrangement without restarting the game.
The title screen plays `title_new.mp3` in the modern layout and the original
`title.mp3` in the dashboard layout; switching layouts restarts the title track.
Timed lyrics appear over the modern title image while its music plays.
The dashboard option follows the original image sizes, score panels, and button
positions, scaling the 1920 x 1080 layout to fit the window. Portrait screens
crop unused side scenery to keep the game larger.

For an HTTP preview, if Python is installed, run `python -m http.server 8000`
from this directory and open <http://localhost:8000>.

## Publish on GitHub Pages

1. Commit and push the website files, including the entire `assets` folder, to GitHub.
2. In the repository, open **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Choose **main** and **/ (root)**, then **Save**.
5. After GitHub finishes publishing, open <https://jamokoo.github.io/SnakeGame/>.
   For a fork, use `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

All assets use relative URLs, so the game works under a GitHub Pages repository
path as well as at a domain root. GitHub Pages serves the separate image and MP3
files normally. The dashboard JSON and extraction script are not loaded by the
webpage and can be omitted from a website-only deployment.

## Controls and rules

- Click, tap, or press **Enter** on the opening overlay to initialize the game.
- **Start**, the title picture, or **Enter** starts a round.
- Use **arrow keys**, **WASD**, the on-screen arrows, or swipe on the board to steer.
- Direction buttons respond when pressed; the most recent valid direction
  takes effect on the next movement.
- **Stop** or **Esc** ends the current round; **Start** starts a fresh one.
- The original 10 x 10 board, five-segment starting snake, 500 ms movement,
  edge wrapping, and one point per apple are preserved.
- Opposite-direction inputs are ignored; the snake keeps moving in its current
  direction. Other self-collisions, including moving into the current tail
  square, end the round.
- Apples are always placed outside the snake. Filling the board wins instead of
  getting stuck looking for another apple.
- Personal hi-scores use browser `localStorage`. If the optional shared score
  service is configured, the score panel shows the highest score across players
  and refreshes when the page loads and each round ends. When the service is unavailable, the panel
  falls back to the personal hi-score, labels it "Hi-Score Local", and displays
  a warning. Without the service, hi-scores are per browser and site and are
  labeled "Hi-Score Local".

## Shared hi-score setup

The shared score uses a Cloudflare Worker and a SQLite-backed Durable Object.
The [Workers free plan](https://developers.cloudflare.com/workers/platform/pricing/)
and [Durable Objects free plan](https://developers.cloudflare.com/durable-objects/platform/pricing/)
have daily limits. No dreamlo account or private leaderboard URL is needed.

1. Create a Cloudflare account and enable Workers.
2. With Node.js installed, run `npx wrangler login` and `npx wrangler deploy`
   from this directory. The supplied `wrangler.toml` creates the Worker and
   its storage. See Cloudflare's [getting started guide](https://developers.cloudflare.com/durable-objects/get-started/)
   if you need help with account setup.
3. Copy the HTTPS Worker URL printed by the deploy command into the
   `shared-score-url` meta tag in [index.html](index.html), then publish the
   updated website. All players must use the same Worker URL.

The Worker accepts only scores from 0 to 95 and only increases the record,
including when submissions arrive concurrently. It cannot verify that a score
was earned in a real game: anyone can submit a fake valid score or exhaust
the free quota. The endpoint URL is public, not a secret. Existing personal
records are not automatically uploaded; round scores are shared when a round
ends (including when stopped). If sharing fails, the score is retried at the
next round end while the page remains open.
If the Worker is not configured, the game remains local-only.

## Extracted assets and development

The original embedded artwork, sprites, button images, music, and sound effects
are extracted unchanged into 31 separate files under [assets](assets). Repeated
tile assets from the dashboard are deduplicated.
[assets/manifest.json](assets/manifest.json) records their MIME types, byte sizes,
and SHA-256 hashes. Original asset credits, including the apple SVG's embedded
source attribution, are retained; extraction does not grant new usage rights.

With Node.js 18 or newer, run:

```powershell
node .\scripts\extract-assets.cjs
node --test .\tests\game-core.test.cjs
node --test .\tests\shared-score.test.cjs
```

The extraction script reads the supplied JSON without executing its embedded
scripts. The webpage itself uses plain HTML, CSS, and JavaScript.
