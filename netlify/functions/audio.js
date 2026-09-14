const { requireValidToken } = require("./_lib/auth");
const path = require("path");
const fs = require("fs");

const ALL_PRIVATE = JSON.parse(fs.readFileSync(path.join(__dirname, "_data", "all-exams-private.json"), "utf8"));
const FREE_EXAM_ID = "exam01";
const VOICES = ["marin", "cedar"];

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

async function synthesizeDialogue(segments) {
  // Stable speaker -> voice mapping WITHIN this call, so the same person
  // keeps the same voice throughout the whole interview. The speaker
  // label ("Moderator:", "Herr Klein:") is intentionally never included
  // in the text sent to TTS — only segment.text is, so it's never spoken
  // out loud as words.
  const voiceOf = {};
  let nextVoiceIdx = 0;
  const buffers = [];
  for (const seg of segments) {
    if (!(seg.speaker in voiceOf)) {
      voiceOf[seg.speaker] = VOICES[nextVoiceIdx % VOICES.length];
      nextVoiceIdx++;
    }
    buffers.push(await synthesize(seg.text, voiceOf[seg.speaker]));
  }
  // Naive MP3 concatenation: works reliably for constant-bitrate clips from
  // the same TTS model/voice settings, which is exactly what this always is.
  return Buffer.concat(buffers);
}

async function getCache() {
  try {
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
  const audioEntry = examPrivate.audio[audioId];
  if (!audioEntry) {
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
    if (typeof audioEntry === "string") {
      mp3Buffer = await synthesize(audioEntry, VOICES[0]);
    } else if (audioEntry.type === "dialogue" && Array.isArray(audioEntry.segments)) {
      mp3Buffer = await synthesizeDialogue(audioEntry.segments);
    } else {
      return { statusCode: 500, body: JSON.stringify({ error: "unrecognized_audio_entry" }) };
    }
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
