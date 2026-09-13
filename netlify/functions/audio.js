const { requireValidToken } = require("./_lib/auth");
const path = require("path");
const fs = require("fs");

const ALL_PRIVATE = JSON.parse(fs.readFileSync(path.join(__dirname, "_data", "all-exams-private.json"), "utf8"));
const FREE_EXAM_ID = "exam01";

// Voice assignment: alternate speakers in multi-person dialogues get
// different voices so listeners can tell who is speaking, matching the
// original design intent (male/female roles) without leaking who's who
// in the transcript text itself (the client never sees text at all here).
function pickVoice(audioText) {
  // crude heuristic: if the text contains an explicit "Name:" speaker
  // label typical of interview-style items, alternate; otherwise default.
  // This is intentionally simple — refine once real usage data exists.
  const looksLikeSecondSpeaker = /:\s*.+:/.test(audioText); // two "X: ... Y:" labels
  return looksLikeSecondSpeaker ? "cedar" : "marin";
}

async function synthesize(text, voice) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured in function environment");
  }
  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, voice, input: text, response_format: "mp3" }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI TTS failed: ${res.status} ${errText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function getCache() {
  try {
    // Optional dependency — only used if the site has Netlify Blobs enabled.
    // Falls back to no caching (re-synthesizes every time) if unavailable,
    // which still WORKS, just costs more in OpenAI usage over time.
    const { getStore } = require("@netlify/blobs");
    return getStore("tts-cache");
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  const audioId = (event.queryStringParameters || {}).id;
  if (!audioId || !audioId.includes("::")) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_audio_id" }) };
  }

  const [examId] = audioId.split("::");
  if (examId !== FREE_EXAM_ID) {
    const auth = requireValidToken(event);
    if (!auth.ok) {
      return { statusCode: auth.status, body: JSON.stringify({ error: auth.error }) };
    }
  }

  const examPrivate = ALL_PRIVATE[examId];
  if (!examPrivate) {
    return { statusCode: 404, body: JSON.stringify({ error: "exam_not_found" }) };
  }
  const audioText = examPrivate.audio[audioId];
  if (!audioText) {
    return { statusCode: 404, body: JSON.stringify({ error: "audio_not_found" }) };
  }

  const cache = await getCache();
  const cacheKey = `${audioId}.mp3`;

  if (cache) {
    const cached = await cache.get(cacheKey, { type: "arrayBuffer" }).catch(() => null);
    if (cached) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=31536000, immutable" },
        body: Buffer.from(cached).toString("base64"),
        isBase64Encoded: true,
      };
    }
  }

  let mp3Buffer;
  try {
    mp3Buffer = await synthesize(audioText, pickVoice(audioText));
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "tts_failed", detail: String(err.message || err) }) };
  }

  if (cache) {
    await cache.set(cacheKey, mp3Buffer).catch(() => {});
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=31536000, immutable" },
    body: mp3Buffer.toString("base64"),
    isBase64Encoded: true,
  };
};
