const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const dashboard = JSON.parse(
  fs.readFileSync(path.join(root, "IoT-Ticket-Snake-dashboard.json"), "utf8"),
);
const extensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "audio/mp3": "mp3",
};
const assets = new Map();
const hashes = new Map();

function extract(data, directory, name) {
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(data);
  if (!match || !extensions[match[1]] || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) {
    throw new Error(`Unsupported embedded asset: ${directory}/${name}`);
  }
  const bytes = Buffer.from(match[2], "base64");
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const file = `${directory}/${name}.${extensions[match[1]]}`;
  if (assets.has(file)) {
    if (assets.get(file).sha256 !== sha256) {
      throw new Error(`Different assets have the same filename: ${file}`);
    }
    return;
  }
  if (hashes.has(sha256)) {
    throw new Error(`Unexpected duplicate asset: ${file} and ${hashes.get(sha256)}`);
  }
  const destination = path.join(root, "assets", ...file.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
  assets.set(file, { file, mimeType: match[1], bytes: bytes.length, sha256 });
  hashes.set(sha256, file);
}

const artworkNames = ["background", "frame", "board", "game-over", "title"];
let artworkIndex = 0;
for (const node of dashboard.nodes) {
  if (node.name === "Image") {
    const name = artworkNames[artworkIndex++];
    if (!name) throw new Error("Unexpected dashboard artwork");
    extract(node.properties.image.value, "images", name);
  } else if (node.name === "StateIndicator") {
    const isTile = /^\d{2}$/.test(node.nodeName);
    for (const state of JSON.parse(node.properties.states.value)) {
      extract(
        state.image.data,
        isTile ? "sprites" : "controls",
        isTile ? state.name : node.nodeName.toLowerCase(),
      );
    }
  }
}
if (artworkIndex !== artworkNames.length) {
  throw new Error("Some dashboard artwork is missing");
}

const audioNames = {
  titleMusic: "title",
  ingameMusic: "ingame",
  deathSound: "death",
  eatSound: "eat",
};
for (const node of dashboard.nodes.filter((node) => node.name === "Script")) {
  const methods = JSON.parse(node.properties.methods.value);
  for (const method of Object.values(methods)) {
    const assignments = method.body.matchAll(
      /window\.(titleMusic|ingameMusic|deathSound|eatSound)\s*=\s*'([A-Za-z0-9+/=]+)'/g,
    );
    for (const [, variable, base64] of assignments) {
      extract(`data:audio/mp3;base64,${base64}`, "audio", audioNames[variable]);
    }
  }
}
for (const name of Object.values(audioNames)) {
  if (!assets.has(`audio/${name}.mp3`)) throw new Error(`Missing audio: ${name}`);
}

fs.writeFileSync(
  path.join(root, "assets", "manifest.json"),
  `${JSON.stringify([...assets.values()], null, 2)}\n`,
);
console.log(`Extracted ${assets.size} unique assets from the dashboard.`);
