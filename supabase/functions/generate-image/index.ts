// supabase/functions/generate-image/index.ts
//
// Server-side proxy for image generation using Gemini's native image model
// (gemini-3.1-flash-image / "Nano Banana 2"), via Google's current
// Interactions API (v1beta/interactions) — the endpoint Google's own docs
// now document for image generation, distinct from the older
// v1beta/models/{model}:generateContent endpoint that v1-chat-completion
// still uses for text chat.
//
// Same GEMINI_API_KEY secret as chat, same Google Cloud project — this is
// just a different model within that same account, nothing extra to
// enable. Reference: https://ai.google.dev/gemini-api/docs/image-generation
//
// Deploy with:
//   supabase functions deploy generate-image
//
// Reuses the same secret already set for chat — no new secret needed:
//   supabase secrets set GEMINI_API_KEY=your-real-key-here

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // tighten to your actual domain in production
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ImageInput {
  data: string;      // base64, no data: prefix
  mimeType: string;
}

interface ImageRequestBody {
  prompt: string;
  images?: ImageInput[]; // uploaded photos to edit/refine, up to a few
}

// If Google renames/retires this alias, check
// https://ai.google.dev/gemini-api/docs/image-generation for the current
// image-capable model id — same Interactions API call shape.
const IMAGE_MODEL = "gemini-3.1-flash-image";
const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

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
    const { prompt, images = [] } = body;

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'prompt'." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Cap reference images defensively — the model supports up to ~10-14
    // depending on variant, but a chat UI attachment flow has no reason to
    // send more than a handful at once.
    const safeImages = images.slice(0, 6);

    const inputBlocks: Record<string, unknown>[] = safeImages.map((img) => ({
      type: "image",
      mime_type: img.mimeType,
      data: img.data,
    }));

    inputBlocks.push({
      type: "text",
      text: safeImages.length > 0
        ? prompt // editing an uploaded photo — send the user's instruction as-is, image(s) provide the subject
        : `Generate a high-quality, detailed image based on this description: ${prompt}`,
    });

    const geminiResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        input: inputBlocks,
      }),
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}));
      console.error("Gemini Interactions API error:", geminiResponse.status, errorData);

      let message =
        `Image generation failed with status ${geminiResponse.status}`;
      if (geminiResponse.status === 429) {
        message = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (geminiResponse.status === 403) {
        message = "Gemini API key is invalid or lacks the required permissions.";
      } else if (geminiResponse.status === 404) {
        message =
          "Image generation model not found for this API key/project. It may need to be enabled, or the model name may have changed.";
      } else if (geminiResponse.status === 400) {
        message = errorData?.error?.message ||
          "Invalid request sent to the image API. Try rephrasing your prompt.";
      }

      return new Response(JSON.stringify({ error: message }), {
        status: geminiResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await geminiResponse.json();

    // Prefer the convenience field if present, otherwise walk the raw
    // steps/content structure — being defensive here since this API
    // surface is new and the exact raw JSON shape isn't fully pinned down
    // in the public docs (only SDK convenience accessors are shown).
    let imageData: string | undefined = data?.output_image?.data;
    let mimeType: string | undefined = data?.output_image?.mime_type;

    if (!imageData) {
      const steps = data?.steps ?? [];
      for (const step of steps) {
        if (step?.type !== "model_output") continue;
        const content = step?.content ?? [];
        const imageBlock = content.find((c: Record<string, unknown>) => c.type === "image");
        if (imageBlock) {
          imageData = imageBlock.data as string;
          mimeType = (imageBlock.mime_type as string) || mimeType;
          break;
        }
      }
    }

    if (!imageData) {
      console.error("No image data in Interactions API response:", JSON.stringify(data));
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
        image: imageData,
        mimeType: mimeType || "image/png",
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
