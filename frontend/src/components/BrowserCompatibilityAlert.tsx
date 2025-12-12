import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export const BrowserCompatibilityAlert = () => {
  const [browser, setBrowser] = useState<string>('');
  const [dismissed, setDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect browser
    if (navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome")) {
      setBrowser('safari');
    }
    // Basic mobile detection (iOS + Android)
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  if (browser !== 'safari' || dismissed) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Layer 2: dimmed overlay above the app */}
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={() => setDismissed(true)}
      />

      {/* Layer 3: centered modal above the overlay */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-lg animate-in fade-in">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-700 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800">Browser Compatibility Notice</h3>
              <p className="text-sm text-yellow-700 mt-1">
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
                  onClick={() => setDismissed(true)}
                  className="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-1.5 rounded-md transition-colors"
                >
                  Dismiss
                </button>
                <a
                  href={isMobile ? "https://www.xverse.app/download" : "https://www.google.com/chrome"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs bg-yellow-700 hover:bg-yellow-800 text-white px-3 py-1.5 rounded-md transition-colors"
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