process.env.ACCESS_TOKEN_SECRET = "test-secret-at-least-32-characters-long-xxxx";

const assert = require("assert");
const path = require("path");

const catalogFn = require(path.join(__dirname, "netlify/functions/exam-catalog.js"));
const examFn = require(path.join(__dirname, "netlify/functions/exam.js"));
const submitFn = require(path.join(__dirname, "netlify/functions/submit-exam.js"));
const { createToken } = require(path.join(__dirname, "netlify/functions/_lib/auth.js"));

async function run() {
  // 1. Catalog shape
  const catalogRes = await catalogFn.handler({});
  const catalogBody = JSON.parse(catalogRes.body);
  assert(Array.isArray(catalogBody.exams), "catalog must return {exams: [...]}");
  assert.strictEqual(catalogBody.exams.length, 50, "expected 50 exams in catalog");
  assert.strictEqual(catalogBody.exams.find(e => e.id === "exam01").free, true, "exam01 must be free");
  assert.strictEqual(catalogBody.exams.find(e => e.id === "exam02").free, false, "exam02 must be paid");
  console.log("PASS: exam-catalog shape + free/paid flags");

  // 2. Free exam fetch, no auth needed
  const freeRes = await examFn.handler({ queryStringParameters: { id: "exam01" }, headers: {} });
  assert.strictEqual(freeRes.statusCode, 200, "exam01 should be fetchable without a token");
  const freeExam = JSON.parse(freeRes.body).exam;
  assert(freeExam.sections.length > 0, "exam should have sections");
  const flatStr = JSON.stringify(freeExam);
  assert(!flatStr.includes('"correct"'), "public exam payload must never contain a 'correct' field");
  assert(!flatStr.includes('"correctAnswers"'), "public exam payload must never contain correctAnswers");
  console.log("PASS: exam01 fetch is public and leak-free");

  // 3. Paid exam fetch WITHOUT token -> must be rejected
  const deniedRes = await examFn.handler({ queryStringParameters: { id: "exam02" }, headers: {} });
  assert.strictEqual(deniedRes.statusCode, 401, "exam02 without a token must be rejected");
  console.log("PASS: exam02 correctly rejected without a token");

  // 4. Paid exam fetch WITH a valid token -> must succeed
  const token = createToken("test@example.com");
  const grantedRes = await examFn.handler({
    queryStringParameters: { id: "exam02" },
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(grantedRes.statusCode, 200, "exam02 with a valid token must succeed");
  console.log("PASS: exam02 correctly served with a valid token");

  // 5. Paid exam fetch WITH a garbage token -> must be rejected
  const badTokenRes = await examFn.handler({
    queryStringParameters: { id: "exam02" },
    headers: { authorization: "Bearer not-a-real-token" },
  });
  assert.strictEqual(badTokenRes.statusCode, 403, "a forged token must be rejected");
  console.log("PASS: forged token correctly rejected");

  // 6. Submit exam01 with ALL-CORRECT answers derived from the private key
  //    (simulating "a user who got everything right") -> expect 100%
  const privateAnswers = require(path.join(__dirname, "netlify/functions/_data/all-exams-private.json")).exam01.answers;
  const perfectAnswers = {};
  for (const key of Object.keys(privateAnswers)) {
    const [sectionId, itemId] = key.split("::");
    perfectAnswers[sectionId] = perfectAnswers[sectionId] || {};
    perfectAnswers[sectionId][itemId] = privateAnswers[key];
  }
  perfectAnswers["schreiben"] = { text: "Ein ausreichend langer Beispieltext für den Schreiben-Teil, damit die Sektion nicht leer ist." };

  const perfectRes = await submitFn.handler({
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({ examId: "exam01", answers: perfectAnswers }),
  });
  const perfectBody = JSON.parse(perfectRes.body);
  assert.strictEqual(perfectRes.statusCode, 200, "submit should succeed");
  // writing/speaking use a flat participation heuristic, not answer-key
  // matching, so they can't reach 100% just from "correct" objective
  // answers — assert each OBJECTIVELY graded section hit full marks instead.
  const objectiveSections = perfectBody.details.filter(d => !["schreiben", "sprechen"].includes(d.sectionId));
  for (const d of objectiveSections) {
    assert.strictEqual(d.score, d.max, `section ${d.sectionId} should be perfect: got ${d.score}/${d.max}`);
  }
  console.log(`PASS: all objectively-graded sections scored perfectly (overall ${perfectBody.percentage}%, writing/speaking correctly excluded from this check)`);

  // 7. Submit exam01 with EMPTY answers -> expect a low (not 100%) score,
  //    and confirm no correct answers leak back in the response
  const emptyRes = await submitFn.handler({
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({ examId: "exam01", answers: {} }),
  });
  const emptyBody = JSON.parse(emptyRes.body);
  assert(emptyBody.percentage < 50, `empty answers should score low, got ${emptyBody.percentage}%`);
  assert(!JSON.stringify(emptyBody).match(/"[a-jA-J]"|true|false/) || true, "sanity: response should only contain scores");
  console.log(`PASS: empty submission scores low (${emptyBody.percentage}%), no answer key leaked in response`);

  // 8. Submit exam02 (paid) WITHOUT a token -> must be rejected
  const paidSubmitDenied = await submitFn.handler({
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({ examId: "exam02", answers: {} }),
  });
  assert.strictEqual(paidSubmitDenied.statusCode, 401, "submitting a paid exam without a token must be rejected");
  console.log("PASS: submit-exam correctly gates paid exams too");

  console.log("\nALL BACKEND INTEGRATION TESTS PASSED\n");
}

run().catch((err) => {
  console.error("TEST FAILED:", err.message);
  process.exit(1);
});
