const fs = require("fs");
const path = require("path");
const { requireValidToken } = require("./_lib/auth");

const ALL_EXAMS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "_data", "all-exams-public.json"), "utf8")
);
const FREE_EXAM_ID = "exam01";

exports.handler = async (event) => {
  const examId = (event.queryStringParameters || {}).id;
  if (!examId || !/^exam\d{2}$/.test(examId)) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_exam_id" }) };
  }

  if (examId !== FREE_EXAM_ID) {
    const auth = requireValidToken(event);
    if (!auth.ok) {
      return { statusCode: auth.status, body: JSON.stringify({ error: auth.error }) };
    }
  }

  const examData = ALL_EXAMS[examId];
  if (!examData) {
    return { statusCode: 404, body: JSON.stringify({ error: "exam_not_found" }) };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exam: examData }),
  };
};
