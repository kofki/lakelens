"use client";

import { useEffect, useRef, useState } from "react";
import { Share, Smartphone, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

const STORAGE_KEY = "lakelens.installHintDismissed";
const SHOW_AFTER_MS = 4000;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Mode = "hidden" | "ios" | "prompt";

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/i.test(ua) || iPadOs;
  const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
  return ios && safari;
}

/**
 * Install nudge. iOS Safari has no install prompt, so we explain Share -> Add to Home Screen.
 * Chromium browsers fire beforeinstallprompt; we defer it and offer an Install button.
 * Dismissal is remembered in localStorage (wrapped in try/catch; private mode is fine).
 */
export function InstallHint() {
  const [mode, setMode] = useState<Mode>("hidden");
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      /* storage unavailable: still show the hint this session */
    }
    if (isStandalone()) return;

    let timer: number | undefined;
    if (isIosSafari()) {
      timer = window.setTimeout(() => setMode("ios"), SHOW_AFTER_MS);
    }
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setMode("prompt");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setMode("hidden");
  }

  async function install() {
    const ev = deferred.current;
    if (!ev) return dismiss();
    try {
      await ev.prompt();
      await ev.userChoice;
    } catch {
      /* user cancelled or prompt unavailable */
    }
    deferred.current = null;
    dismiss();
  }

  if (mode === "hidden") return null;

  return (
    <aside
      aria-label="Install LakeLens"
      className="fixed inset-x-3 z-50 mx-auto max-w-lg rounded-card border border-mist bg-white p-3 shadow-sheet md:hidden"
      style={{ bottom: "calc(var(--bottom-nav-h) + env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 inline-flex shrink-0 rounded-full bg-peach p-2 text-cocoa">
          <Smartphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1 text-sm text-cocoa">
          <p className="font-extrabold">Add LakeLens to your home screen</p>
          {mode === "ios" ? (
            <p className="mt-0.5 text-cocoa/75">
              Tap <Share aria-hidden="true" className="inline size-4 align-text-bottom" />{" "}
              <span className="font-bold">Share</span>, then{" "}
              <SquarePlus aria-hidden="true" className="inline size-4 align-text-bottom" />{" "}
              <span className="font-bold">Add to Home Screen</span>. It works offline for the basics.
            </p>
          ) : (
            <p className="mt-0.5 text-cocoa/75">One tap to install. Opens full screen and loads faster.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {mode === "prompt" && (
              <Button size="md" onClick={install}>
                Install
              </Button>
            )}
            <Button variant="ghost" size="md" onClick={dismiss}>
              {mode === "prompt" ? "Not now" : "Got it"}
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install hint"
          className="-mr-1 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-cocoa hover:bg-mist/50"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
    </aside>
  );
}
