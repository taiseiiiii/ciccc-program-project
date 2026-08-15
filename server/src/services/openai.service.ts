import { env } from "../config/env";
import { HttpError } from "../utils/HttpError";

/**
 * Thin transport layer over the OpenAI Chat Completions API.
 *
 * Called with plain fetch (built into Node >= 20) rather than the `openai`
 * SDK: the app needs exactly one endpoint, and skipping the dependency keeps
 * both committed lockfiles (npm + pnpm) untouched.
 *
 * Uses Structured Outputs (`response_format: json_schema` with `strict`), so
 * the model's reply is guaranteed to match the given JSON Schema — no
 * "please answer in JSON" prompt tricks, no hand-rolled parsing fallbacks.
 * Note the strict-mode rules: every property must be listed in `required`
 * and every object needs `additionalProperties: false`.
 */

const CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

// One AI report is a single round-trip, but generation regularly takes
// 10–30 s; give it room while still failing before typical LB idle timeouts.
const REQUEST_TIMEOUT_MS = 60_000;

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
}

/**
 * Ask the model for a completion that conforms to `schema`, and return the
 * parsed object. Upstream problems surface as HttpErrors so the central error
 * handler can translate them (503 = key not configured, 502/504 = OpenAI
 * failed or timed out) instead of leaking opaque 500s.
 */
export async function completeWithSchema<T>(options: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  if (!env.openaiApiKey) {
    throw HttpError.serviceUnavailable(
      "AI analysis is not configured on this server (missing OPENAI_API_KEY)",
    );
  }

  let res: Response;
  try {
    res = await fetch(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: env.openaiModel,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: options.schemaName,
            strict: true,
            schema: options.schema,
          },
        },
        // Low-ish temperature: coaching advice should stay grounded in the
        // supplied stats, with just enough variation between regenerations.
        temperature: 0.4,
        max_tokens: options.maxTokens ?? 1500,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw HttpError.gatewayTimeout("AI analysis timed out — please try again");
    }
    throw HttpError.badGateway("Could not reach the AI service");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const detail = body.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) {
      // Our key, not the caller's token — so 502, not 401.
      throw HttpError.badGateway("AI service rejected the configured API key");
    }
    if (res.status === 429) {
      throw HttpError.serviceUnavailable(
        "AI service is rate-limited right now — please try again shortly",
      );
    }
    throw HttpError.badGateway(`AI service error: ${detail}`);
  }

  const data = (await res.json()) as ChatCompletionResponse;
  const message = data.choices?.[0]?.message;
  if (message?.refusal) {
    throw HttpError.badGateway(`AI declined to generate a report: ${message.refusal}`);
  }
  if (!message?.content) {
    throw HttpError.badGateway("AI service returned an empty response");
  }

  try {
    return JSON.parse(message.content) as T;
  } catch {
    throw HttpError.badGateway("AI service returned malformed JSON");
  }
}
