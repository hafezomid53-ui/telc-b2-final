const { requireValidToken } = require("./_lib/auth");

const FREE_EXAM_ID = "exam01";
const MAX_TEXT_LENGTH = 4000; // characters — prevents abuse via huge inputs run up on your OpenAI bill

const LANG_NAMES = { fa: "Persian", de: "German", en: "English", ar: "Arabic" };

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
  }

  const { examId, text, lang } = body;
  if (!examId || !/^exam\d{2}$/.test(examId) || typeof text !== "string" || !text.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_request" }) };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { statusCode: 413, body: JSON.stringify({ error: "text_too_long", max: MAX_TEXT_LENGTH }) };
  }

  if (examId !== FREE_EXAM_ID) {
    const auth = requireValidToken(event);
    if (!auth.ok) {
      return { statusCode: auth.status, body: JSON.stringify({ error: auth.error }) };
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "server_misconfigured" }) };
  }

  const replyLang = LANG_NAMES[lang] || "Persian";
  const systemPrompt = `You are an expert German B2 exam examiner (CEFR B2 formal writing).
Correct the student's letter and give clear feedback.
Reply entirely in ${replyLang}.
Structure your reply as:
1) Overall score estimate (0-15 points for B2 writing)
2) Corrected version of the text (if needed)
3) Grammar & vocabulary notes
4) Content checklist
5) 2-3 concrete tips to improve to B2 level.
Be encouraging but precise.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Student letter (Schreiben task):\n\n${text}` },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: "openai_failed", detail: errText }) };
    }

    const data = await res.json();
    const feedback = data.choices?.[0]?.message?.content || "";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "request_failed", detail: String(err.message || err) }) };
  }
};
