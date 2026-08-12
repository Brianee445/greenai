// supabase/functions/v1-chat-completion/index.ts
//
// Server-side proxy for chat completions.
// Primary provider: Gemini API (GEMINI_API_KEY).
// Fallback provider: Groq (GROQ_API_KEY) - an OpenAI-compatible, free-tier
// gateway - used only when Gemini itself appears to be down/misconfigured
// (network failure, 5xx, 429 rate limit, or 403 bad/invalid key). Content-based
// failures (bad request, safety blocks, prompt blocked) are NOT retried on the
// fallback, since those would likely fail on any provider too and are more
// useful surfaced directly to the caller.
//
// Deploy with:
//   supabase functions deploy v1-chat-completion
//
// Set the secrets (once) with:
//   supabase secrets set GEMINI_API_KEY=your-real-gemini-key
//   supabase secrets set GROQ_API_KEY=your-real-groq-key
//   # optional, defaults to llama-3.3-70b-versatile - see https://console.groq.com/docs/models for available model names
//   supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // tighten to your actual domain in production
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChatFile {
  name: string;
  type: "image" | "document" | "audio";
  mimeType?: string;
  content?: string; // for documents: plain text content
  base64?: string;  // for images/audio: base64 data (no data: prefix)
}

interface ChatRequestBody {
  prompt: string;
  model: string; // internal model key, e.g. 'gx-2.0'
  webSearch?: boolean;
  files?: ChatFile[];
}

const MODEL_MAP: Record<string, string> = {
  "gx-1.5": "gemini-2.5-flash",
  "gx-2.0": "gemini-3.5-flash",
  "gx-3.0": "gemini-3.1-flash-lite",
};

function getGeminiModelName(internalModel: string): string {
  return MODEL_MAP[internalModel] || "gemini-2.5-flash";
}

// NOTE: 8192 is a conservative default. Some Gemini model families support far
// higher output token ceilings - check the current limit for whichever model
// each MODEL_MAP entry points to on Google's model reference page, since a low
// ceiling here will silently truncate long responses (surfaced below via
// finishReason === "MAX_TOKENS" so at least it's no longer silent).
const MAX_OUTPUT_TOKENS = Number(Deno.env.get("GEMINI_MAX_OUTPUT_TOKENS")) || 8192;

interface CompletionResult {
  text: string;
  usedSearch: boolean;
  truncated: boolean;
  provider: "gemini" | "groq";
}

// Thrown when Gemini fails in a way that should NOT trigger the fallback
// (bad request, safety block, prompt blocked) - the caller returns this
// straight to the client instead of retrying on another provider.
class ContentError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Thrown when Gemini fails in a way that suggests the provider itself is
// unavailable (network error, 5xx, 429, 403) - the caller should attempt
// the Groq fallback.
class ProviderUnavailableError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function callGemini(
  prompt: string,
  internalModel: string,
  webSearch: boolean,
  files: ChatFile[],
): Promise<CompletionResult> {
  if (!GEMINI_API_KEY) {
    throw new ProviderUnavailableError("GEMINI_API_KEY secret is not set", 500);
  }

  const geminiModel = getGeminiModelName(internalModel);
  const API_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;

  const parts: Record<string, unknown>[] = [];

  // ── FILE PROCESSING ────────────────────────────────────────────────
  for (const file of files) {
    if (file.type === "document" && file.content) {
      parts.push({
        text: `DOCUMENT: ${file.name}\n\n${file.content}\n\n---END OF DOCUMENT---\n\n`,
      });
    } else if (file.type === "image" && file.base64) {
      parts.push({
        text: `IMAGE: ${file.name}\nPlease analyse this image thoroughly:\n`,
      });
      parts.push({
        inline_data: {
          mime_type: file.mimeType || "image/jpeg",
          data: file.base64,
        },
      });
    } else if (file.type === "audio" && file.base64) {
      parts.push({
        text:
          `The user has sent a voice message. Listen to what they are saying, understand their question or request, and respond to it directly and helpfully. Do NOT transcribe, repeat back, or rewrite what they said - simply answer them as you would any normal message.\n`,
      });
      parts.push({
        inline_data: {
          mime_type: file.mimeType || "audio/webm",
          data: file.base64,
        },
      });
    }
  }

  // Main text prompt always goes last
  parts.push({ text: prompt });

  const requestBody: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.7,
      topK: 50,
      topP: 0.98,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  };

  if (webSearch) {
    requestBody.tools = [{ google_search: {} }];
  }

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch (networkError) {
    // fetch itself threw - DNS failure, connection refused, timeout, etc.
    console.error("Network error calling Gemini:", networkError);
    throw new ProviderUnavailableError(
      "Failed to reach Gemini API.",
      0,
    );
  }

  if (!geminiResponse.ok) {
    const errorData = await geminiResponse.json().catch(() => ({}));
    console.error("Gemini API error:", geminiResponse.status, errorData);

    // 5xx, 429 (rate limit), and 403 (bad/invalid key or no access) all mean
    // Gemini itself is the problem, not the request - worth falling back.
    if (
      geminiResponse.status >= 500 ||
      geminiResponse.status === 429 ||
      geminiResponse.status === 403
    ) {
      const message = geminiResponse.status === 429
        ? "Rate limit exceeded."
        : geminiResponse.status === 403
        ? "Gemini API key is invalid or lacks access to this model."
        : `Gemini API request failed with status ${geminiResponse.status}`;
      throw new ProviderUnavailableError(message, geminiResponse.status);
    }

    // 400 / 404 / other client errors are treated as content/config issues,
    // not provider outages - surface directly, don't fall back.
    let message = `Gemini API request failed with status ${geminiResponse.status}`;
    if (geminiResponse.status === 404) {
      message = "Model not found. The specified model may not be available.";
    } else if (geminiResponse.status === 400) {
      message = "Invalid request sent to Gemini API.";
    }
    throw new ContentError(message, geminiResponse.status);
  }

  const data = await geminiResponse.json();

  // The prompt itself can be blocked before any generation happens
  // (e.g. safety filters on the input). This has a totally different
  // shape from a normal response - no candidates array at all.
  if (data?.promptFeedback?.blockReason) {
    console.error("Prompt blocked by Gemini:", data.promptFeedback);
    throw new ContentError(
      `Your message was blocked by the model's safety filters (${data.promptFeedback.blockReason}). Please rephrase and try again.`,
      400,
    );
  }

  const candidate = data?.candidates?.[0];
  const finishReason = candidate?.finishReason;

  if (finishReason === "SAFETY" || finishReason === "RECITATION") {
    console.error("Gemini withheld content:", finishReason, data);
    throw new ContentError(
      finishReason === "SAFETY"
        ? "The response was blocked by safety filters. Try rephrasing your request."
        : "The response was blocked due to a recitation concern. Try rephrasing your request.",
      400,
    );
  }

  // Concatenate ALL text parts, not just the first one. Gemini can split
  // a single response across multiple `parts` entries.
  const textParts = candidate?.content?.parts
    ?.map((part: Record<string, unknown>) =>
      typeof part.text === "string" ? part.text : ""
    )
    .filter(Boolean);

  const text = textParts && textParts.length > 0 ? textParts.join("") : undefined;

  if (!text) {
    console.error("Invalid Gemini response shape:", data);
    // No usable text came back at all - treat this as a provider-side
    // problem worth retrying on the fallback rather than a content issue.
    throw new ProviderUnavailableError(
      "Invalid response format from Gemini API",
      502,
    );
  }

  const usedSearch = Boolean(
    webSearch && candidate?.groundingMetadata?.webSearchQueries?.length,
  );

  const truncated = finishReason === "MAX_TOKENS";

  return { text, usedSearch: usedSearch || webSearch, truncated, provider: "gemini" };
}

// OpenAI-compatible chat message (Groq's default text models, including
// llama-3.3-70b-versatile, are text-only - no image_url content parts - so
// unlike an image-capable provider this builds plain string content and
// substitutes a text note for image/audio files instead of embedding them.)
function buildGroqMessages(
  prompt: string,
  files: ChatFile[],
): { role: "user"; content: string }[] {
  const segments: string[] = [];

  for (const file of files) {
    if (file.type === "document" && file.content) {
      segments.push(`DOCUMENT: ${file.name}\n\n${file.content}\n\n---END OF DOCUMENT---\n`);
    } else if (file.type === "image") {
      segments.push(
        `NOTE: The user attached an image ("${file.name}"), but image input isn't available on the fallback provider - let them know if their request can't be understood without seeing it.\n`,
      );
    } else if (file.type === "audio") {
      segments.push(
        `NOTE: The user sent a voice message ("${file.name}"), but audio input isn't available on the fallback provider - let them know if their request can't be understood without it.\n`,
      );
    }
  }

  segments.push(prompt);

  return [{ role: "user", content: segments.join("\n") }];
}

async function callGroq(
  prompt: string,
  files: ChatFile[],
): Promise<CompletionResult> {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY secret is not set - cannot use fallback.");
  }

  const requestBody = {
    model: GROQ_MODEL,
    messages: buildGroqMessages(prompt, files),
    temperature: 0.7,
  };

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (networkError) {
    console.error("Network error calling Groq:", networkError);
    throw new Error("Failed to reach Groq fallback API.");
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Groq API error:", response.status, errorData);
    throw new Error(`Groq fallback request failed with status ${response.status}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text || typeof text !== "string") {
    console.error("Invalid Groq response shape:", data);
    throw new Error("Invalid response format from Groq fallback API.");
  }

  const finishReason = data?.choices?.[0]?.finish_reason;
  const truncated = finishReason === "length";

  // Search grounding isn't forwarded to the fallback - it just answers from
  // the model's own knowledge, so this is always reported as false rather
  // than implying a search happened.
  return { text, usedSearch: false, truncated, provider: "groq" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: ChatRequestBody = await req.json();
    const { prompt, model, webSearch = false, files = [] } = body;

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'prompt'." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let result: CompletionResult;
    let usedFallback = false;

    try {
      result = await callGemini(prompt, model, webSearch, files);
    } catch (err) {
      if (err instanceof ContentError) {
        // Content/config issue - not a provider outage. Surface directly,
        // do not fall back.
        return new Response(JSON.stringify({ error: err.message }), {
          status: err.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ProviderUnavailableError (or anything unexpected) - try the fallback.
      console.error("Gemini unavailable, attempting Groq fallback:", err);

      try {
        result = await callGroq(prompt, files);
        usedFallback = true;
      } catch (fallbackErr) {
        console.error("Groq fallback also failed:", fallbackErr);
        return new Response(
          JSON.stringify({
            error:
              "Both the primary and fallback AI providers are currently unavailable. Please try again shortly.",
          }),
          {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    return new Response(
      JSON.stringify({
        text: result.text,
        webSearch: result.usedSearch,
        truncated: result.truncated,
        provider: result.provider,
        usedFallback,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Unhandled error in v1-chat-completion:", error);
    return new Response(
      JSON.stringify({
        error: "Something went wrong processing your request.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
