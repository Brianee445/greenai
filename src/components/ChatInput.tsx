import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, X, FileText, ArrowUp, Square, Mic, MicOff, Globe, ImagePlus } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { validateFile } from '../subscriptions/utils/upload';

// PDF worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface UploadedFile {
  file: File;
  type: 'image' | 'document' | 'audio';
  preview?: string;  // base64 data URI (images & audio)
  content?: string;  // extracted text (documents)
}

interface ChatInputProps {
  onSendMessage: (message: string, files?: UploadedFile[], webSearch?: boolean, imageGen?: boolean) => void;
  // Called when the user taps the stop button while a response is generating.
  // Optional so ChatInput still works untouched in places that don't wire it up yet.
  onStopGeneration?: () => void;
  disabled: boolean;
  placeholder?: string;
  darkMode: boolean;
  onAuthRequired?: (feature: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onStopGeneration,
  disabled,
  placeholder = 'Message GREEN AI',
  darkMode,
  onAuthRequired,
}) => {
  const [message, setMessage] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [imageGenEnabled, setImageGenEnabled] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const textareaRef      = useRef<HTMLTextAreaElement>(null);
  const fileInputRef     = useRef<HTMLInputElement>(null);
  const audioInputRef    = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);

  // Auto-resize textarea. Max height raised from 200px to 320px so the box
  // scales further with longer messages before it starts internally scrolling.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [message]);

  // ───────── FILE READERS ─────────

  const readAsDataURL = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const readPDF = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n\n';
    }
    return text.trim();
  };

  const readTextFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsText(file);
    });

  // ───────── FILE UPLOAD ─────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setIsProcessingFiles(true);
    const results: UploadedFile[] = [];
    for (const file of Array.from(files)) {
      const validation = validateFile(file);
      if (!validation.valid) {
        alert(validation.error);
        continue;
      }
      try {
        if (file.type.startsWith('image/')) {
          results.push({ file, type: 'image', preview: await readAsDataURL(file) });
        } else if (file.type.startsWith('audio/')) {
          results.push({ file, type: 'audio', preview: await readAsDataURL(file) });
        } else if (file.name.endsWith('.pdf')) {
          results.push({ file, type: 'document', content: await readPDF(file) });
        } else {
          results.push({ file, type: 'document', content: await readTextFile(file) });
        }
      } catch {
        alert(`Failed to process ${file.name}`);
      }
    }
    setUploadedFiles(prev => [...prev, ...results]);
    setIsProcessingFiles(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setIsProcessingFiles(true);
    const results: UploadedFile[] = [];
    for (const file of Array.from(files)) {
      try {
        if (file.type.startsWith('audio/')) {
          results.push({ file, type: 'audio', preview: await readAsDataURL(file) });
        }
      } catch {
        alert(`Failed to process ${file.name}`);
      }
    }
    setUploadedFiles(prev => [...prev, ...results]);
    setIsProcessingFiles(false);
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const removeFile = (index: number) =>
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));

  // ───────── VOICE RECORDING ─────────

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Voice recording is not supported on this device.');
        return;
      }

      // Constraints passed directly into the request
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      audioChunksRef.current = [];
      
      let options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options.mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        options.mimeType = 'audio/wav';
      }
      
      const recorder = new MediaRecorder(stream, options);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('wav') ? 'wav' : 'webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const file = new File([blob], `voice-note-${Date.now()}.${extension}`, { type: mimeType });
        
        try {
          const preview = await readAsDataURL(file);
          setUploadedFiles(prev => [...prev, { file, type: 'audio', preview }]);
        } catch {
          alert('Failed to process voice recording.');
        }
        
        stream.getTracks().forEach(t => t.stop());
        audioChunksRef.current = [];
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone access error:', error);
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          alert('Microphone access was denied. Please enable microphone permissions in your browser settings.');
        } else if (error.name === 'NotFoundError') {
          alert('No microphone found. Please check your device.');
        } else {
          alert(`Error accessing microphone: ${error.message}`);
        }
      } else {
        alert('Could not access microphone. Please try again.');
      }
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      setIsRecording(false);
      mediaRecorderRef.current = null;
    }
  };

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          const hasAudioInput = devices.some(device => device.kind === 'audioinput');
          if (!hasAudioInput) console.warn('No audio input devices found');
        })
        .catch(err => console.warn('Could not enumerate devices:', err));
    }
  }, []);

  // ───────── SUBMIT ─────────

  const canSend = (message.trim() || uploadedFiles.length > 0) && !isProcessingFiles;

  // While disabled=true, the parent is generating a response, so the
  // send button becomes an active stop button instead of being inert.
  const isGenerating = disabled;

  const handleSubmit = () => {
    if (!canSend || disabled) return;
    onSendMessage(message.trim(), uploadedFiles.length ? uploadedFiles : undefined, webSearchEnabled, imageGenEnabled);
    setMessage('');
    setUploadedFiles([]);
  };

  const handleSendOrStop = () => {
    if (isGenerating) {
      onStopGeneration?.();
    } else {
      handleSubmit();
    }
  };

  // ───────── THEME ─────────

  const bg         = darkMode ? '#2f2f2f' : '#ffffff';
  const border     = darkMode ? '#555'    : '#e0e0e0';
  const textColor  = darkMode ? '#f1f1f1' : '#111111';
  const iconColor  = darkMode ? '#999'    : '#666666';
  const hoverBg    = darkMode ? '#3a3a3a' : '#f0f0f0';
  const chipBg     = darkMode ? '#3a3a3a' : '#eeeeee';
  const sendBg     = canSend  ? (darkMode ? '#ffffff' : '#000000') : (darkMode ? '#555' : '#cccccc');
  const sendColor  = canSend  ? (darkMode ? '#000000' : '#ffffff') : (darkMode ? '#888' : '#999999');

  const IconBtn = ({
    onClick, title, children, active = false, activeColor,
  }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    active?: boolean;
    activeColor?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isProcessingFiles}
      title={title}
      className="flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-150"
      style={{
        color:           active ? activeColor : iconColor,
        backgroundColor: active ? `${activeColor}18` : 'transparent',
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.backgroundColor = active ? `${activeColor}18` : 'transparent';
      }}
    >
      {children}
    </button>
  );

  return (
    <div className="w-full px-4 pb-4">
      <div
        className={`max-w-3xl mx-auto rounded-2xl border transition-all duration-200 ${
          isFocused ? 'ring-gradient-green' : ''
        }`}
        style={{ backgroundColor: bg, borderColor: isFocused ? 'transparent' : border }}
      >
        {uploadedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {uploadedFiles.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-xs font-medium"
                style={{ backgroundColor: chipBg, color: textColor }}
              >
                {f.type === 'image' && f.preview ? (
                  <img src={f.preview} className="w-5 h-5 rounded object-cover" alt="" />
                ) : f.type === 'audio' ? (
                  <span>🎵</span>
                ) : (
                  <FileText size={13} />
                )}
                <span className="max-w-[100px] truncate">{f.file.name}</span>
                <button
                  onClick={() => removeFile(i)}
                  className="ml-0.5 p-0.5 rounded-full hover:bg-black/10"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="px-3 pt-3">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={isProcessingFiles ? 'Processing files…' : imageGenEnabled ? 'Describe the image you want…' : placeholder}
            disabled={disabled || isProcessingFiles}
            rows={1}
            className="w-full resize-none outline-none text-sm sm:text-[15px] leading-relaxed transition-[height] duration-100"
            style={{
              background:  'transparent',
              color:       textColor,
              minHeight:   '28px',
              maxHeight:   '320px',
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
        </div>

        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <div className="flex items-center gap-0.5">
            <IconBtn onClick={() => {
              if (onAuthRequired) {
                onAuthRequired('upload files');
              } else {
                fileInputRef.current?.click();
              }
            }} title="Attach file">
              <Paperclip size={17} />
            </IconBtn>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.pdf,audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            <IconBtn
              onClick={() => {
                if (!isRecording && onAuthRequired) {
                  onAuthRequired('use voice input');
                } else {
                  isRecording ? stopRecording() : startRecording();
                }
              }}
              title={isRecording ? 'Stop recording' : 'Record voice message'}
              active={isRecording}
              activeColor="#ef4444"
            >
              {isRecording ? <MicOff size={17} /> : <Mic size={17} />}
            </IconBtn>

            <IconBtn onClick={() => {
              if (onAuthRequired) {
                onAuthRequired('upload audio');
              } else {
                audioInputRef.current?.click();
              }
            }} title="Upload audio file">
              <svg
                width="17" height="17" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </IconBtn>
            <input
              ref={audioInputRef}
              type="file"
              multiple
              accept="audio/*"
              onChange={handleAudioUpload}
              className="hidden"
            />

            {/* Image Generation Toggle */}
            <button
              type="button"
              onClick={() => {
                setImageGenEnabled(prev => !prev);
                if (!imageGenEnabled) setWebSearchEnabled(false);
              }}
              disabled={disabled}
              title={imageGenEnabled ? 'Image generation on — click to disable' : 'Generate an image instead of text'}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 border ml-1"
              style={{
                color:           imageGenEnabled ? '#10b981' : iconColor,
                backgroundColor: imageGenEnabled ? (darkMode ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.1)') : 'transparent',
                borderColor:     imageGenEnabled ? '#10b981' : (darkMode ? '#444' : '#d1d5db'),
              }}
            >
              <ImagePlus size={13} />
              <span>Image</span>
            </button>

            {/* Web Search Toggle */}
            <button
              type="button"
              onClick={() => {
                setWebSearchEnabled(prev => !prev);
                if (!webSearchEnabled) setImageGenEnabled(false);
              }}
              disabled={disabled}
              title={webSearchEnabled ? 'Web search on — click to disable' : 'Enable web search'}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 border ml-1"
              style={{
                color:           webSearchEnabled ? '#10b981' : iconColor,
                backgroundColor: webSearchEnabled ? (darkMode ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.1)') : 'transparent',
                borderColor:     webSearchEnabled ? '#10b981' : (darkMode ? '#444' : '#d1d5db'),
              }}
            >
              <Globe size={13} />
              <span>Search</span>
            </button>
          </div>

          {/* Send / Stop button.
              While generating, this is a real stop control: it's enabled and
              clickable (previously it was just a Square icon glued to a
              disabled button), styled with the animated green gradient so
              it visibly reads as "active" rather than greyed out. */}
          <button
            type="button"
            onClick={handleSendOrStop}
            disabled={isGenerating ? false : !canSend}
            title={isGenerating ? 'Stop generating' : 'Send message'}
            className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150 ${
              isGenerating ? 'gradient-glow-active' : ''
            }`}
            style={{ backgroundColor: isGenerating ? undefined : sendBg }}
          >
            {isGenerating ? (
              <Square size={13} fill="#ffffff" style={{ color: '#ffffff' }} />
            ) : (
              <ArrowUp size={16} style={{ color: sendColor }} />
            )}
          </button>
        </div>
      </div>

      {isRecording && (
        <div className="max-w-3xl mx-auto mt-1.5 flex items-center gap-1.5 px-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs" style={{ color: iconColor }}>Recording… tap mic to stop</span>
        </div>
      )}
    </div>
  );
};
