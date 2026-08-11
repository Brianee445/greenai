import { supabase } from '../lib/supabase';

// Image generation goes through the generate-image Supabase edge function,
// which holds the real GEMINI_API_KEY server-side — the same key used by
// chat (v1-chat-completion). No key ever lives in this file or the browser.

interface ImageInput {
  data: string;      // base64, no data: prefix
  mimeType: string;
}

export const generateImage = async (
  prompt: string,
  images?: ImageInput[]
): Promise<{ url: string; isPersistent: boolean }> => {
  const { data, error } = await supabase.functions.invoke('generate-image', {
    body: { prompt, images },
  });

  if (error) {
    // supabase-js's FunctionsHttpError.message is just a generic
    // "Edge Function returned a non-2xx status code" — the actual error
    // body our function sent (e.g. "Rate limit exceeded", "No image was
    // returned...") lives on error.context, which is the raw Response
    // object. Read it directly instead of surfacing the generic message.
    let detailedMessage: string | undefined;
    try {
      const context = (error as { context?: Response }).context;
      if (context && typeof context.json === 'function') {
        const body = await context.json();
        detailedMessage = body?.error;
      }
    } catch {
      // context wasn't readable JSON — fall through to generic message
    }

    console.error('Error invoking generate-image function:', detailedMessage || error.message, error);
    throw new Error(detailedMessage || error.message || 'Failed to generate image');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  // Preferred path: the function uploaded to Supabase Storage and gave us
  // a permanent URL — this is what survives a page refresh.
  if (data?.url) {
    return { url: data.url, isPersistent: true };
  }

  // Fallback path: Storage upload wasn't available server-side, so we only
  // got base64 back. This still displays fine in the current session, but
  // the resulting blob: URL will NOT survive a refresh or new session.
  if (data?.image) {
    const mimeType = data.mimeType || 'image/png';
    const blob = base64ToBlob(data.image, mimeType);
    const url = URL.createObjectURL(blob);
    return { url, isPersistent: false };
  }

  throw new Error('No image data returned');
};

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteArray = new Uint8Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  return new Blob([byteArray], { type: mimeType });
};

export const downloadImage = (
  blob: Blob,
  filename: string = 'generated-image.png'
): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const revokeImageUrl = (url: string): void => {
  URL.revokeObjectURL(url);
};
