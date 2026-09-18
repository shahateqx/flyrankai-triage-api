import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { client } from "../llm/client.js";
import { triageInputSchema, triageOutputSchema, STUB_RESPONSE } from "../llm/schema.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROMPT_VERSION = "v1";
const promptPath = path.join(__dirname, "../../prompts", `triage-${PROMPT_VERSION}.md`);
const systemPrompt = fs.readFileSync(promptPath, "utf-8");

function getLogDir() {
  const dir = path.join(__dirname, "../../logs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function quarantine(input, rawOutput, error) {
  const logDir = getLogDir();
  const entry = {
    timestamp: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    input: input,
    rawOutput: rawOutput,
    error: error,
  };
  fs.appendFileSync(
    path.join(logDir, "quarantine.jsonl"),
    JSON.stringify(entry) + "\n"
  );
}

function logCost(data) {
  const logDir = getLogDir();
  const entry = {
    timestamp: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    model: data.model,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    durationMs: data.durationMs,
    repairAttempt: data.repairAttempt,
  };
  fs.appendFileSync(
    path.join(logDir, "cost.jsonl"),
    JSON.stringify(entry) + "\n"
  );
  console.log("[cost]", JSON.stringify(entry));
}

function extractJson(text) {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  const braceStart = cleaned.indexOf("{");
  const braceEnd = cleaned.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1) {
    cleaned = cleaned.slice(braceStart, braceEnd + 1);
  }
  return JSON.parse(cleaned);
}

async function callModel(userText, isRepair = false, brokenOutput = "", validationError = "") {
  let messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userText },
  ];

  if (isRepair) {
    messages.push({
      role: "assistant",
      content: brokenOutput,
    });
    messages.push({
      role: "user",
      content: `Your previous answer was rejected for this reason: ${validationError}. Return only corrected JSON matching the schema.`,
    });
  }

  const startTime = Date.now();

  const res = await client.chat.completions.create({
    model: process.env.LLM_MODEL,
    messages: messages,
    temperature: 0.1,
  });

  const durationMs = Date.now() - startTime;
  const rawText = res.choices[0].message.content;

  logCost({
    model: res.model || process.env.LLM_MODEL,
    inputTokens: res.usage?.prompt_tokens || 0,
    outputTokens: res.usage?.completion_tokens || 0,
    durationMs: durationMs,
    repairAttempt: isRepair,
  });

  return rawText;
}

async function callWithRetry(userText) {
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await callModel(userText);
    } catch (err) {
      lastError = err;

      const status = err.status || err.statusCode;

      if (status === 400 || status === 401 || status === 403) {
        throw err;
      }

      if (status === 429 || status >= 500 || err.code === "ETIMEDOUT" || err.code === "ECONNABORTED") {
        let waitTime = Math.pow(2, attempt) * 1000;
        let jitter = Math.random() * 500;

        if (err.headers && err.headers["retry-after"]) {
          const retryAfter = parseInt(err.headers["retry-after"]);
          if (!isNaN(retryAfter)) {
            waitTime = retryAfter * 1000;
          }
        }

        console.log(`[retry] attempt ${attempt + 1}/${maxRetries}, waiting ${Math.round(waitTime + jitter)}ms`);
        await new Promise((r) => setTimeout(r, waitTime + jitter));
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

router.post("/triage", async (req, res) => {
  const inputResult = triageInputSchema.safeParse(req.body);
  if (!inputResult.success) {
    return res.status(400).json({
      error: "Invalid input",
      details: inputResult.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  }

  if (process.env.LLM_STUB === "1") {
    return res.json(STUB_RESPONSE);
  }

  if (process.env.LLM_ENABLED === "false") {
    return res.status(503).json({
      category: "other",
      urgency: "low",
      confidence: 0,
      reason: "LLM is currently disabled",
      _fallback: true,
    });
  }

  const userText = inputResult.data.text;

  try {
    let rawText = await callWithRetry(userText);

    let parsed;
    let parseError;
    try {
      parsed = extractJson(rawText);
    } catch (e) {
      parseError = e.message;
    }

    let outputResult;
    if (parsed) {
      outputResult = triageOutputSchema.safeParse(parsed);
    }

    if (parsed && outputResult && outputResult.success) {
      return res.json(outputResult.data);
    }

    let errorMsg = parseError || (outputResult ? outputResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") : "unknown error");

    console.log("[repair] first attempt failed:", errorMsg);

    let repairText;
    try {
      repairText = await callModel(userText, true, rawText, errorMsg);
    } catch (repairErr) {
      quarantine(userText, rawText, errorMsg);
      return res.status(422).json({
        error: "Model output failed validation and repair call also failed",
        details: errorMsg,
      });
    }

    let repairParsed;
    try {
      repairParsed = extractJson(repairText);
    } catch (e) {
      quarantine(userText, repairText, e.message);
      return res.status(422).json({
        error: "Model output failed validation even after repair",
        details: e.message,
      });
    }

    const repairResult = triageOutputSchema.safeParse(repairParsed);
    if (repairResult.success) {
      return res.json(repairResult.data);
    }

    let repairErrorMsg = repairResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    quarantine(userText, repairText, repairErrorMsg);
    return res.status(422).json({
      error: "Model output failed validation even after repair",
      details: repairErrorMsg,
    });
  } catch (err) {
    if (err.code === "ETIMEDOUT" || err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
      return res.status(504).json({ error: "Model call timed out" });
    }
    console.error("[error]", err.message);
    return res.status(500).json({ error: "Something went wrong calling the model" });
  }
});

export default router;
