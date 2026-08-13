/**
 * Pluggable inference layer.
 *
 * If OPENAI_API_KEY is present the agents call the OpenAI Responses API for
 * classification / summarisation / Q&A. Otherwise they fall back to the local
 * deterministic engine in ./local.ts, so the vault is fully functional offline
 * and no document ever has to leave the machine.
 */
export type Engine = "openai" | "local";

export function engineName(): Engine {
  return process.env.OPENAI_API_KEY ? "openai" : "local";
}

export function engineLabel(): string {
  return engineName() === "openai"
    ? `OpenAI ${process.env.OPENAI_MODEL || "gpt-4o-mini"}`
    : "VaultMind Local NLP";
}

type JsonCall = { system: string; user: string; maxTokens?: number };

/** Ask the LLM for strict JSON. Returns null when unavailable or malformed. */
export async function llmJson<T>(call: JsonCall): Promise<T | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: call.maxTokens ?? 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.user },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = data?.choices?.[0]?.message?.content;
    return txt ? (JSON.parse(txt) as T) : null;
  } catch {
    return null;
  }
}

/** Free-form completion (used for plain-language rewrites). */
export async function llmText(call: JsonCall): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: call.maxTokens ?? 600,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.user },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
