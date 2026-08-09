import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'greenai-mobile-banner-last-shown';
const SHOW_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const AUTO_CLOSE_MS = 15000; // 15 seconds
const APP_LINK = 'https://median.co/share/nmnpqzz';

interface MobileAppBannerProps {
  darkMode: boolean;
}

export function MobileAppBanner({ darkMode }: MobileAppBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Decide on mount whether 24h have passed since it was last dismissed/clicked
  useEffect(() => {
    const lastShown = localStorage.getItem(STORAGE_KEY);
    const now = Date.now();
    if (!lastShown || now - parseInt(lastShown, 10) >= SHOW_INTERVAL_MS) {
      setIsVisible(true);
    }
  }, []);

  // Drive the countdown bar + auto-close once visible
  useEffect(() => {
    if (!isVisible) return;

    const startTime = Date.now();
    setProgress(100);

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.max(0, 100 - (elapsed / AUTO_CLOSE_MS) * 100));
    }, 50);

    timeoutRef.current = setTimeout(() => handleDismiss(), AUTO_CLOSE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setIsVisible(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 shadow-lg"
      style={{
        backgroundColor: darkMode ? '#2a2a2a' : '#f7f7f8',
        borderBottom: darkMode ? '1px solid #3a3a3a' : '1px solid #e5e5e5',
      }}
    >
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0" aria-hidden>📲</span>
          <div className="min-w-0">
            <p
              className="text-sm font-medium truncate"
              style={{ color: darkMode ? '#ececec' : '#0d0d0d' }}
            >
              Get the GREEN AI mobile app
            </p>
            <p
              className="text-xs truncate"
              style={{ color: darkMode ? '#8e8ea0' : '#6e6e80' }}
            >
              Faster access, push notifications, and more.
            </p>
          </div>
        </div>

        <a
          href={APP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleDismiss}
          className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium bg-gradient-to-r from-emerald-400 to-green-600 text-white hover:opacity-90 transition-opacity"
        >
          Download
        </a>

        <button
          onClick={handleDismiss}
          aria-label="Close banner"
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors text-sm"
          style={{ color: darkMode ? '#8e8ea0' : '#6e6e80' }}
        >
          ❌
        </button>
      </div>

      {/* Countdown slider */}
      <div className="h-0.5 w-full bg-black/10">
        <div
          className="h-full bg-gradient-to-r from-emerald-400 to-green-600"
          style={{ width: `${progress}%`, transition: 'width 50ms linear' }}
        />
      </div>
    </div>
  );
}
