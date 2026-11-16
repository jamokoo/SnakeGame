(function (root) {
  "use strict";

  function createSharedScore(url, request = fetch) {
    async function send(score) {
      const options = score === undefined ? {} : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      };
      const response = await request(url, options);
      if (!response.ok) throw new Error(`Shared hi-score request failed (${response.status})`);
      const result = await response.json();
      if (!Number.isInteger(result.score) || result.score < 0 || result.score > 95) {
        throw new Error("Shared hi-score response is invalid");
      }
      return result.score;
    }

    return { read: () => send(), submit: (score) => send(score) };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { createSharedScore };
  else root.createSharedScore = createSharedScore;
})(typeof window !== "undefined" ? window : globalThis);
