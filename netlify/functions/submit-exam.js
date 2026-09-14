const fs = require("fs");
const path = require("path");
const { requireValidToken } = require("./_lib/auth");

const ALL_PUBLIC = JSON.parse(fs.readFileSync(path.join(__dirname, "_data", "all-exams-public.json"), "utf8"));
const ALL_PRIVATE = JSON.parse(fs.readFileSync(path.join(__dirname, "_data", "all-exams-private.json"), "utf8"));
const FREE_EXAM_ID = "exam01";

// Mirrors the section-type dispatch that used to live in the client's
// calculateResults() — now run server-side against the private answer
// key instead of an embedded `correct` field.
function scoreSection(section, userAnswersForSection, answerKey) {
  const ua = userAnswersForSection || {};
  const sid = section.id;
  let sc = 0, mx = 0;
  const lookup = (itemId) => answerKey[`${sid}::${itemId}`];

  switch (section.type) {
    case "matching-headlines":
      (section.texts || []).forEach((t) => {
        mx++;
        const correct = lookup(t.id);
        if ((ua[t.id] || "").toLowerCase() === String(correct || "").toLowerCase()) sc++;
      });
      break;

    case "mcq":
    case "mcq-grammar":
      (section.questions || section.items || []).forEach((q) => {
        mx++;
        if (ua[q.id] === lookup(q.id)) sc++;
      });
      break;

    case "matching-person":
      (section.statements || []).forEach((st) => {
        mx++;
        const correct = lookup(st.id);
        if ((ua[st.id] || "").toLowerCase() === String(correct || "").toLowerCase()) sc++;
      });
      break;

    case "cloze": {
      // blank ids aren't listed on the public section anymore (the whole
      // correctAnswers dict was stripped), so we derive them from the
      // answer-key entries that belong to this section.
      const prefix = `${sid}::`;
      Object.keys(answerKey)
        .filter((k) => k.startsWith(prefix))
        .forEach((k) => {
          mx++;
          const blankId = k.slice(prefix.length);
          const correct = answerKey[k];
          if ((ua[blankId] || "").toLowerCase() === String(correct || "").toLowerCase()) sc++;
        });
      break;
    }

    case "truefalse":
      (section.items || []).forEach((it) => {
        mx++;
        if (ua[it.id] === lookup(it.id)) sc++;
      });
      break;

    case "writing":
      // Objective scoring for writing is unreliable by keyword-matching;
      // real feedback comes from /api/correct-writing. Here we just award
      // a flat participation score so it contributes to the overall %
      // without pretending to grade content quality server-side.
      mx = 15;
      sc = (ua.text || "").trim().length > 0 ? 8 : 0;
      break;

    case "speaking":
      mx = 0; sc = 0; // not machine-graded
      break;

    default:
      break;
  }

  return { sectionId: sid, score: sc, max: mx };
}

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

  const { examId, answers } = body;
  if (!examId || !/^exam\d{2}$/.test(examId) || typeof answers !== "object") {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_request" }) };
  }

  if (examId !== FREE_EXAM_ID) {
    const auth = requireValidToken(event);
    if (!auth.ok) {
      return { statusCode: auth.status, body: JSON.stringify({ error: auth.error }) };
    }
  }

  const examStructure = ALL_PUBLIC[examId];
  const examPrivate = ALL_PRIVATE[examId];
  if (!examStructure || !examPrivate) {
    return { statusCode: 404, body: JSON.stringify({ error: "exam_not_found" }) };
  }
  const answerKey = examPrivate.answers;

  const details = examStructure.sections.map((section) =>
    scoreSection(section, answers[section.id], answerKey)
  );

  const totalScore = details.reduce((sum, d) => sum + d.score, 0);
  const totalMax = details.reduce((sum, d) => sum + d.max, 0);
  const percentage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ percentage, score: totalScore, max: totalMax, details }),
  };
};
