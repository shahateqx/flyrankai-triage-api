import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,
  timeout: 30000,
  maxRetries: 0,
});

console.log(`[llm] provider: ${process.env.LLM_BASE_URL}, model: ${process.env.LLM_MODEL}, timeout: 30s, sdk retries: off`);

export { client };
