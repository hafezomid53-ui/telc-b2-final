const catalog = require("./_data/exam-catalog.json");

exports.handler = async () => {
  const exams = catalog.map((c) => ({
    id: c.id,
    title: c.title,
    totalTimeMinutes: c.totalTimeMinutes,
    free: !c.locked,
  }));
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    body: JSON.stringify({ exams }),
  };
};
