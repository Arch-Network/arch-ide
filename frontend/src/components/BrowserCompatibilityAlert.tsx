import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const BROWSER_COMPAT_DISMISSED_KEY = 'browser-compatibility-alert-dismissed';

export const BrowserCompatibilityAlert = () => {
  const [browser, setBrowser] = useState<string>('');
  const [dismissed, setDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Respect persisted dismissal
    if (localStorage.getItem(BROWSER_COMPAT_DISMISSED_KEY) === 'true') {
      setDismissed(true);
      return;
    }

    // Detect browser
    if (navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome")) {
      setBrowser('safari');
    }
    // Basic mobile detection (iOS + Android)
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  if (browser !== 'safari' || dismissed) return null;

  const dismissForever = () => {
    localStorage.setItem(BROWSER_COMPAT_DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="fixed inset-0 z-modal" role="dialog" aria-modal="true" aria-labelledby="browser-compat-title">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={dismissForever}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-warning/10 border border-warning/30 rounded-lg p-4 shadow-lg animate-in fade-in">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 id="browser-compat-title" className="font-medium text-foreground">Browser Compatibility Notice</h3>
              <p className="text-sm text-foreground/80 mt-1">
                {isMobile ? (
                  <>
                    Mobile browsers can have limited Bitcoin wallet support. For signing{' '}
                    <span className="font-medium">BIP-322</span> messages, we recommend using a mobile Bitcoin wallet that supports BIP-322
                    (Taproot), such as <span className="font-medium">Xverse</span>.
                  </>
                ) : (
                  <>
                    For the best experience, including full Bitcoin wallet support, we recommend using Chrome or Firefox. Some features may be
                    limited in Safari.
                  </>
                )}
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={dismissForever}
                  className="text-xs bg-accent hover:bg-surface-3 text-foreground px-3 py-1.5 rounded-md transition-colors"
                >
                  Dismiss
                </button>
                <a
                  href={isMobile ? "https://www.xverse.app/download" : "https://www.google.com/chrome"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs bg-warning hover:bg-warning/90 text-warning-foreground px-3 py-1.5 rounded-md transition-colors"
                >
                  {isMobile ? "Get Xverse Wallet" : "Download Chrome"}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};