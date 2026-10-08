"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Download, Check } from "lucide-react";
import { Button } from "./ui/button";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
const InstallContext = createContext<{
  installed: boolean;
  ios: boolean;
  prompt: InstallEvent | null;
  clear: () => void;
}>({ installed: false, ios: false, prompt: null, clear: () => {} });

export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const sync = () =>
      setInstalled(
        standalone.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    sync();
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    const offer = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const complete = () => {
      setPrompt(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", complete);
    standalone.addEventListener("change", sync);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Installation can still work; a later visit retries offline support.
        });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", complete);
      standalone.removeEventListener("change", sync);
    };
  }, []);
  return (
    <InstallContext.Provider
      value={{ installed, ios, prompt, clear: () => setPrompt(null) }}
    >
      {children}
    </InstallContext.Provider>
  );
}

export function InstallApp() {
  const { installed, ios, prompt, clear } = useContext(InstallContext);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <div className="settings-row install-app">
      <div>
        <strong>
          {installed ? "Installed on this device" : "Keep Resibo’ko close"}
        </strong>
        <p>
          {installed
            ? "Open your receipts directly from your home screen."
            : ios
              ? "In Safari, tap Share, then Add to Home Screen."
              : "Install from your browser’s menu to open Resibo’ko like an app."}
        </p>
        <p className="install-note">
          An internet connection is needed to access and save receipts.
        </p>
        {notice && <p role="status">{notice}</p>}
      </div>
      {installed ? (
        <Check size={20} aria-label="Installed" />
      ) : (
        prompt && (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await prompt.prompt();
                const choice = await prompt.userChoice;
                setNotice(
                  choice.outcome === "accepted"
                    ? "Follow your browser’s instructions to finish installing."
                    : "You can install later from your browser’s menu.",
                );
              } catch {
                setNotice("Open your browser’s menu to install the app.");
              } finally {
                clear();
                setBusy(false);
              }
            }}
          >
            <Download size={16} />
            {busy ? "Opening…" : "Install app"}
          </Button>
        )
      )}
    </div>
  );
}
