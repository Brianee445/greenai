import { supabase } from '../lib/supabase';

// Image generation goes through the generate-image Supabase edge function,
// which holds the real GEMINI_API_KEY server-side — the same key used by
// chat (v1-chat-completion). No key ever lives in this file or the browser.

export const generateImage = async (prompt: string): Promise<{ url: string; blob: Blob }> => {
  const { data, error } = await supabase.functions.invoke('generate-image', {
    body: { prompt },
  });

  if (error) {
    console.error('Error invoking generate-image function:', error);
    throw new Error(error.message || 'Failed to generate image');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data?.image) {
    throw new Error('No image data returned');
  }

  const mimeType = data.mimeType || 'image/png';
  const blob = base64ToBlob(data.image, mimeType);
  const url = URL.createObjectURL(blob);

  // Return both so the caller can revoke the URL and download without re-fetching
  return { url, blob };
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
