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

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

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

serve(async (req: Request) => {
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

  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY secret is not set");
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
        maxOutputTokens: 8192,
      },
    };

    if (webSearch) {
      requestBody.tools = [{ google_search: {} }];
    }

    const geminiResponse = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}));
      console.error("Gemini API error:", geminiResponse.status, errorData);

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

    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

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

    return new Response(
      JSON.stringify({ text, webSearch: usedSearch || webSearch }),
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
