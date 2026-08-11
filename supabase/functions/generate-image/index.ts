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
//
// Also uploads the resulting image to Supabase Storage (bucket:
// generated-images) using the service role key, which Supabase injects
// into every edge function automatically — no extra secret needed for
// that either. This is what makes generated images survive a page
// refresh: without it, the client only ever holds a blob: URL, which is
// torn down the moment the tab reloads or closes.

import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
//
// gemini-3.1-flash-image has documented, ongoing intermittent 404s on the
// Interactions API (multiple independent developer reports, mid-2026) that
// are unrelated to anything in this function — same request that works one
// moment 404s the next, with no code change on either side. FALLBACK_MODEL
// is Google's own suggested workaround for exactly this failure mode.
const IMAGE_MODEL = "gemini-3.1-flash-image";
const FALLBACK_MODEL = "gemini-2.5-flash-image";
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

    console.log(
      `generate-image request: prompt length=${prompt.length}, images received=${images.length}, images used=${safeImages.length}` +
      (safeImages.length > 0 ? `, first image size=${safeImages[0].data?.length ?? 0} chars, mimeType=${safeImages[0].mimeType}` : "")
    );

    const inputBlocks: Record<string, unknown>[] = safeImages.map((img) => ({
      type: "image",
      mime_type: img.mimeType,
      data: img.data,
    }));

    inputBlocks.push({
      type: "text",
      text: safeImages.length > 0
        // Editing an uploaded photo: without explicit "keep everything else
        // the same" framing, the model tends to treat a casual instruction
        // as license to regenerate the whole scene rather than edit it —
        // this is Google's own documented pattern for reliable edits.
        ? `Using the provided image, ${prompt}. Keep everything else in the image exactly the same — the subject, their appearance, the composition, and the style — unless the instruction explicitly asks to change it. If the image contains any text, keep it in English only.`
        : `Generate a high-quality, detailed image based on this description: ${prompt}. If the image includes any text or typography, it must be in English only — do not include text in any other language or script.`,
    });

    async function callModel(modelId: string) {
      return fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          model: modelId,
          input: inputBlocks,
        }),
      });
    }

    // Transient/model-availability failures (404, or 5xx from Google's
    // side) get one retry on the same model, then one attempt on the
    // fallback model, before giving up. 429 (rate limit) and 400 (bad
    // request — e.g. safety block) are NOT retried, since retrying won't
    // help and just burns quota/time on an error that will recur.
    const isTransient = (status: number) => status === 404 || status >= 500;

    let geminiResponse = await callModel(IMAGE_MODEL);
    let modelUsed = IMAGE_MODEL;

    if (!geminiResponse.ok && isTransient(geminiResponse.status)) {
      console.warn(`${IMAGE_MODEL} returned ${geminiResponse.status}, retrying once...`);
      geminiResponse = await callModel(IMAGE_MODEL);
    }

    if (!geminiResponse.ok && isTransient(geminiResponse.status)) {
      console.warn(`${IMAGE_MODEL} still failing (${geminiResponse.status}), falling back to ${FALLBACK_MODEL}...`);
      geminiResponse = await callModel(FALLBACK_MODEL);
      modelUsed = FALLBACK_MODEL;
    }

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}));
      console.error(`Gemini Interactions API error (model=${modelUsed}):`, geminiResponse.status, errorData);

      let message =
        `Image generation failed with status ${geminiResponse.status}`;
      if (geminiResponse.status === 429) {
        message = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (geminiResponse.status === 403) {
        message = "Gemini API key is invalid or lacks the required permissions.";
      } else if (geminiResponse.status === 404) {
        message =
          "Image generation is temporarily unavailable on Google's side. Please try again in a moment.";
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

    const finalMimeType = mimeType || "image/png";

    // Upload to Storage so the image has a permanent URL instead of only
    // existing as base64 in this one response (which the client can only
    // turn into an ephemeral blob: URL that dies on refresh).
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not available — returning base64 as a fallback, but this image will NOT persist across a page refresh.");
      return new Response(
        JSON.stringify({ image: imageData, mimeType: finalMimeType }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    try {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const byteCharacters = atob(imageData);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }

      const ext = finalMimeType.split("/")[1] || "png";
      const path = `${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("generated-images")
        .upload(path, byteArray, { contentType: finalMimeType, upsert: false });

      if (uploadError) {
        console.error("Storage upload failed, falling back to base64:", uploadError);
        return new Response(
          JSON.stringify({ image: imageData, mimeType: finalMimeType }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from("generated-images")
        .getPublicUrl(path);

      return new Response(
        JSON.stringify({ url: publicUrlData.publicUrl, mimeType: finalMimeType }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (uploadErr) {
      console.error("Unexpected error uploading to storage, falling back to base64:", uploadErr);
      return new Response(
        JSON.stringify({ image: imageData, mimeType: finalMimeType }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
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
