const { requireValidToken } = require("./_lib/auth");
const path = require("path");
const fs = require("fs");

const ALL_PRIVATE = JSON.parse(fs.readFileSync(path.join(__dirname, "_data", "all-exams-private.json"), "utf8"));
const FREE_EXAM_ID = "exam01";
// Keep the same two cloud voices for the same roles in every interview.
// Do not infer voices from segment order: some interviews begin with the guest.
const INTERVIEWER_VOICE = "marin";
const GUEST_VOICE = "cedar";

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
  // Stable role -> voice mapping across every exam. Speaker labels are
  // metadata only and are never sent to TTS.
  const voiceOf = {};
  const interviewerNames = /^(moderator(in)?|interviewer(in)?|主持人|مصاحبه‌گر)$/i;
  const cleanText = (speaker, value) => {
    const text = String(value || "").trim();
    if (!speaker || !text) return text;
    const escaped = String(speaker).replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
    return text.replace(new RegExp(`^${escaped}\\s*:\\s*`, "i"), "").trim();
  };
  let nextVoiceIdx = 0;
  const buffers = [];
  for (const seg of segments) {
    const speaker = String(seg.speaker || "guest").trim();
    const role = interviewerNames.test(speaker) ? "interviewer" : "guest";
    if (!(role in voiceOf)) {
      voiceOf[role] = role === "interviewer" ? INTERVIEWER_VOICE : GUEST_VOICE;
      nextVoiceIdx++;
    }
    const text = cleanText(speaker, seg.text);
    if (text) buffers.push(await synthesize(text, voiceOf[role]));
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
