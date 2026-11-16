const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function json(body, status = 200) {
  return Response.json(body, { status, headers });
}

export class HighScore {
  constructor(state) {
    this.storage = state.storage.kv;
  }

  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method === "GET") return json({ score: this.storage.get("score") ?? 0 });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (!body || !Number.isInteger(body.score) || body.score < 0 || body.score > 95) {
      return json({ error: "Score must be an integer between 0 and 95" }, 400);
    }
    const previous = this.storage.get("score") ?? 0;
    const score = Math.max(previous, body.score);
    if (score > previous) this.storage.put("score", score);
    return json({ score });
  }
}

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname !== "/") return json({ error: "Not found" }, 404);
    return env.HIGH_SCORE.getByName("global").fetch(request);
  },
};
