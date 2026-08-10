// supabase/functions/generate-image/index.ts
//
// Server-side proxy for image generation via Google's Imagen API.
// Reuses the same GEMINI_API_KEY secret as v1-chat-completion — it never
// reaches the client, only this function ever sees it.
//
// Deploy with:
//   supabase functions deploy generate-image
//
// No separate secret needed — this reads the same GEMINI_API_KEY already
// set for chat:
//   supabase secrets set GEMINI_API_KEY=your-real-key-here

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // tighten to your actual domain in production
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ImageRequestBody {
  prompt: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
}

// imagen-3.0-generate-002 is reachable through the same Generative Language
// API/key as the gemini-* chat models — no separate Vertex AI project needed.
const IMAGE_MODEL = "imagen-3.0-generate-002";
const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:predict`;

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
    const body: ImageRequestBody = await req.json();
    const { prompt, aspectRatio = "1:1" } = body;

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'prompt'." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const imagenResponse = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [
          {
            prompt:
              `Generate a high-quality, detailed image based on this description: ${prompt}. Make it visually appealing, creative, and professionally rendered.`,
          },
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio,
          safetyFilterLevel: "block_some",
          personGeneration: "allow_adult",
        },
      }),
    });

    if (!imagenResponse.ok) {
      const errorData = await imagenResponse.json().catch(() => ({}));
      console.error("Imagen API error:", imagenResponse.status, errorData);

      let message =
        `Image generation failed with status ${imagenResponse.status}`;
      if (imagenResponse.status === 429) {
        message = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (imagenResponse.status === 403) {
        message =
          "Gemini API key is invalid or lacks access to image generation.";
      } else if (imagenResponse.status === 400) {
        message = errorData?.error?.message ||
          "Invalid request sent to the image API. Try rephrasing your prompt.";
      }

      return new Response(JSON.stringify({ error: message }), {
        status: imagenResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await imagenResponse.json();
    const prediction = data?.predictions?.[0];

    if (!prediction?.bytesBase64Encoded) {
      console.error("Invalid Imagen response shape:", data);
      return new Response(
        JSON.stringify({
          error:
            "No image was returned. Your prompt may have been blocked by safety filters — try rephrasing it.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        image: prediction.bytesBase64Encoded,
        mimeType: prediction.mimeType || "image/png",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Unhandled error in generate-image:", error);
    return new Response(
      JSON.stringify({
        error: "Something went wrong generating your image.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
