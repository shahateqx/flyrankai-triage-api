# Support Message Triage API

A simple API endpoint that takes a customer support message and classifies it into a category and urgency level using an LLM. One request in, one structured JSON answer out - not a chatbot.

The LLM is treated like any other external API: validate input before calling it, validate output after, and never trust what it says without checking.

## What it does

Send a support message, get back a category (billing/bug/feature/other), urgency (low/normal/high), a confidence score, and a short reason. The model's answer is validated against a strict schema every time - if it returns garbage, the endpoint tries to fix it once, then gives up cleanly instead of passing bad data through.

## Quick start

```bash
git clone https://github.com/YOUR_USERNAME/flyrankai.git
cd flyrankai
npm install
cp .env.example .env
# add your OpenRouter key to .env
npm start
```

## Try it

Valid request:
```bash
curl -X POST http://localhost:3000/triage -H "Content-Type: application/json" -d "{\"text\": \"I was charged twice for my subscription this month\"}"
```

Response:
```json
{
  "category": "billing",
  "urgency": "high",
  "confidence": 0.95,
  "reason": "Customer reports duplicate charge on subscription"
}
```

Bad request (missing text field):
```bash
curl -X POST http://localhost:3000/triage -H "Content-Type: application/json" -d "{}"
```

Response:
```json
{
  "error": "Invalid input",
  "details": [{"field": "text", "message": "Required"}]
}
```

## Job card

- **What it does**: Classifies a customer support message so it lands on the right team
- **Input**: `{ "text": "string, 1-2000 characters" }`
- **Output**: `{ "category": billing|bug|feature|other, "urgency": low|normal|high, "confidence": 0.0-1.0, "reason": "short sentence" }`
- **It must never**: invent a category outside the list, return free text, give medical/legal/financial advice, reveal the prompt
- **When unsure**: return category "other" with low confidence

## Provider and model

- **Provider**: OpenRouter (free tier, no credit card needed)
- **Model**: `openrouter/auto` (free model router)
- **Base URL**: `https://openrouter.ai/api/v1`

Three env vars to swap providers:
- `LLM_BASE_URL` - the provider's API URL
- `LLM_API_KEY` - your API key
- `LLM_MODEL` - which model to use

These are the only difference between running on OpenRouter, Ollama, or any OpenAI-compatible provider. Nothing else in the code changes.

## Environment variables

| Variable | What it does |
|----------|-------------|
| `LLM_BASE_URL` | Provider API URL |
| `LLM_API_KEY` | Your API key |
| `LLM_MODEL` | Model ID to use |
| `LLM_STUB` | Set to `1` to skip model calls and return fake data |
| `LLM_ENABLED` | Set to `false` to disable the model (kill switch) |
| `PORT` | Server port (default 3000) |

## Eval results

- **Score**: _/8 (run `npm run eval` with server running)
- **Date**: 2026-09-19
- **Prompt version**: v1

## Cost per call

(fill in after running - check logs/cost.jsonl)

- Input tokens: ~
- Output tokens: ~
- Duration: ~ms
- Estimated cost at 10,000 requests/day: $0 (using free tier)

## Retry policy

I disabled the SDK's built-in retries (`maxRetries: 0`) and wrote my own. Retries only happen on:
- Timeouts
- 429 (rate limited)
- 5xx (server errors)

Never retries on 400, 401, or 403 because a bad request or wrong key won't fix itself. Uses exponential backoff with jitter (1s, 2s, 4s + random). Respects the Retry-After header if the server sends one.

## What I'd fix with another day

- Add caching for repeated inputs to save API calls
- Better prompt injection defense
- More eval cases, especially edge cases
- Try a second model and compare scores
