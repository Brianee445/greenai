// supabase/functions/v1-chat-completion/index.ts
//
// Server-side proxy for Gemini API calls.
// The GEMINI_API_KEY secret never reaches the client — only this function
// ever sees it, since it runs on Supabase's servers, not in the browser.
//
// Deploy with:
//   supabase functions deploy v1-chat-completion
//
// Set the secret (once) with:
//   supabase secrets set GEMINI_API_KEY=your-real-key-here
//
// TEMPORARY FALLBACK: if the Gemini account is having a quota/billing/
// outage issue (as opposed to this specific request failing on its own
// merits), every chat request would otherwise fail with no recourse.
// This tries Gemini first — so it silently goes back to normal the moment
// the Gemini-side issue is fixed, no redeploy needed — and only falls
// back to AgentRouter (a separate account/credits, unrelated to Gemini's
// billing) when Gemini itself is unreachable/erroring. Text only for now,
// per explicit instruction — no file/image/web-search support on this
// fallback path, since AgentRouter's free-credit catalog is chat-only.
//
//   supabase secrets set AGENTROUTER_API_KEY=your-agentrouter-key-here

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const AGENT_ROUTER_API_KEY = Deno.env.get("AGENT_ROUTER_API_KEY");

// AgentRouter is OpenAI-compatible. Change this to whichever of the
// account's available models you want as the fallback — as of this
// writing the catalog only has these three:
//   claude-opus-5, claude-opus-4-8, gpt-5.6-sol
const AGENTROUTER_MODEL = "claude-opus-5";
const AGENTROUTER_URL = "https://agentrouter.org/v1/chat/completions";

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
// higher output token ceilings — check the current limit for whichever model
// each MODEL_MAP entry points to on Google's model reference page, since a low
// ceiling here will silently truncate long responses (surfaced below via
// finishReason === "MAX_TOKENS" so at least it's no longer silent).
const MAX_OUTPUT_TOKENS = Number(Deno.env.get("GEMINI_MAX_OUTPUT_TOKENS")) || 8192;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!GEMINI_API_KEY && !AGENT_ROUTER_API_KEY) {
    console.error("Neither GEMINI_API_KEY nor AGENT_ROUTER_API_KEY is set");
    return new Response(
      JSON.stringify({ error: "Server is not configured correctly." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
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

    const geminiModel = getGeminiModelName(model);
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
            `The user has sent a voice message. Listen to what they are saying, understand their question or request, and respond to it directly and helpfully. Do NOT transcribe, repeat back, or rewrite what they said — simply answer them as you would any normal message.\n`,
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

    const geminiResponse = GEMINI_API_KEY
      ? await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })
      : new Response(JSON.stringify({ error: { message: "GEMINI_API_KEY not set" } }), { status: 500 });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}));
      console.error("Gemini API error:", geminiResponse.status, errorData);

      if (AGENT_ROUTER_API_KEY) {
        console.warn("Gemini failed, trying AgentRouter fallback (text only)...");
        try {
          const orResponse = await fetch(AGENTROUTER_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${AGENT_ROUTER_API_KEY}`,
            },
            body: JSON.stringify({
              model: AGENTROUTER_MODEL,
              messages: [{ role: "user", content: prompt }],
              temperature: 0.7,
            }),
          });

          if (orResponse.ok) {
            const orData = await orResponse.json();
            const fallbackText = orData?.choices?.[0]?.message?.content;

            if (typeof fallbackText === "string" && fallbackText.length > 0) {
              console.log("AgentRouter fallback succeeded.");
              return new Response(
                JSON.stringify({
                  text: fallbackText,
                  webSearch: false, // fallback path has no web-search/grounding support
                  truncated: false,
                  fallback: true, // lets the client know Gemini was down for this response, if it wants to show that
                }),
                {
                  status: 200,
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                },
              );
            }
            console.error("AgentRouter response had no usable text:", JSON.stringify(orData).slice(0, 500));
          } else {
            const orErrorBody = await orResponse.text().catch(() => "");
            console.error("AgentRouter fallback also failed:", orResponse.status, orErrorBody.slice(0, 500));
          }
        } catch (orErr) {
          console.error("Unexpected error calling AgentRouter fallback:", orErr);
        }
      }

      // Both Gemini and the fallback (if configured) failed — report the
      // original Gemini error, since that's the more actionable one.
      let message = `Gemini API request failed with status ${geminiResponse.status}`;
      if (geminiResponse.status === 429) {
        message = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (geminiResponse.status === 403) {
        message = "Gemini API key is invalid or lacks access to this model.";
      } else if (geminiResponse.status === 404) {
        message = "Model not found. The specified model may not be available.";
      } else if (geminiResponse.status === 400) {
        message = "Invalid request sent to Gemini API.";
      }

      return new Response(JSON.stringify({ error: message }), {
        status: geminiResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await geminiResponse.json();

    // The prompt itself can be blocked before any generation happens
    // (e.g. safety filters on the input). This has a totally different
    // shape from a normal response — no candidates array at all — and
    // was previously falling through to a generic "invalid format" error.
    if (data?.promptFeedback?.blockReason) {
      console.error("Prompt blocked by Gemini:", data.promptFeedback);
      return new Response(
        JSON.stringify({
          error:
            `Your message was blocked by the model's safety filters (${data.promptFeedback.blockReason}). Please rephrase and try again.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const candidate = data?.candidates?.[0];

    // A candidate can stop for reasons other than finishing normally.
    // SAFETY / RECITATION mean content was withheld, often with empty parts.
    // MAX_TOKENS means the response was cut off mid-generation — that's the
    // main "long responses don't come through" failure mode, and previously
    // this was completely silent.
    const finishReason = candidate?.finishReason;

    if (finishReason === "SAFETY" || finishReason === "RECITATION") {
      console.error("Gemini withheld content:", finishReason, data);
      return new Response(
        JSON.stringify({
          error:
            finishReason === "SAFETY"
              ? "The response was blocked by safety filters. Try rephrasing your request."
              : "The response was blocked due to a recitation concern. Try rephrasing your request.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Concatenate ALL text parts, not just the first one. Gemini can split
    // a single response across multiple `parts` entries — this was the
    // actual cause of long responses appearing truncated, since only
    // parts[0].text was ever being read before.
    const textParts = candidate?.content?.parts
      ?.map((part: Record<string, unknown>) =>
        typeof part.text === "string" ? part.text : ""
      )
      .filter(Boolean);

    const text = textParts && textParts.length > 0 ? textParts.join("") : undefined;

    if (!text) {
      console.error("Invalid Gemini response shape:", data);
      return new Response(
        JSON.stringify({ error: "Invalid response format from Gemini API" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const usedSearch = Boolean(
      webSearch && candidate?.groundingMetadata?.webSearchQueries?.length,
    );

    // Let the client know the response was cut off by the token ceiling
    // rather than finishing naturally, so it can be surfaced to the user
    // or used to trigger a "continue" follow-up instead of pretending the
    // answer is complete.
    const truncated = finishReason === "MAX_TOKENS";

    return new Response(
      JSON.stringify({
        text,
        webSearch: usedSearch || webSearch,
        truncated,
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
