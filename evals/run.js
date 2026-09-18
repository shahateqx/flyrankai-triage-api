import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "cases.json"), "utf-8"));

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;
let failures = [];

for (let i = 0; i < cases.length; i++) {
  const testCase = cases[i];
  try {
    const response = await fetch(`${BASE_URL}/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: testCase.input }),
    });

    const data = await response.json();

    let casePassed = true;

    if (testCase.expected.category && data.category !== testCase.expected.category) {
      casePassed = false;
    }
    if (testCase.expected.urgency && data.urgency !== testCase.expected.urgency) {
      casePassed = false;
    }

    if (casePassed) {
      passed++;
      console.log(`  PASS [${i + 1}] "${testCase.input.substring(0, 50)}..."`);
    } else {
      failed++;
      failures.push({
        index: i + 1,
        input: testCase.input,
        expected: testCase.expected,
        got: { category: data.category, urgency: data.urgency },
      });
      console.log(`  FAIL [${i + 1}] "${testCase.input.substring(0, 50)}..."`);
      console.log(`    expected: ${JSON.stringify(testCase.expected)}`);
      console.log(`    got:      ${JSON.stringify({ category: data.category, urgency: data.urgency })}`);
    }
  } catch (err) {
    failed++;
    failures.push({ index: i + 1, input: testCase.input, error: err.message });
    console.log(`  ERROR [${i + 1}] "${testCase.input.substring(0, 50)}..." - ${err.message}`);
  }
}

console.log(`\n--- Eval Results ---`);
console.log(`Date: ${new Date().toISOString().split("T")[0]}`);
console.log(`Prompt version: v1`);
console.log(`Results: ${passed}/${cases.length} passed (${Math.round((passed / cases.length) * 100)}%)`);

if (failures.length > 0) {
  console.log(`\nFailed cases:`);
  failures.forEach((f) => {
    console.log(`  Case ${f.index}: "${f.input.substring(0, 60)}"`);
    if (f.error) {
      console.log(`    Error: ${f.error}`);
    } else {
      console.log(`    Expected: ${JSON.stringify(f.expected)}`);
      console.log(`    Got:      ${JSON.stringify(f.got)}`);
    }
  });
}
