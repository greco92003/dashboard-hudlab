"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

/**
 * Hook with the PWA install logic (extracted from the old PWAInstallButton).
 *
 * - Captures the `beforeinstallprompt` event on Chromium browsers
 * - On iOS there is no prompt API, so `promptInstall` shows instructions
 * - `canInstall` is false when the app is already running in standalone mode
 */
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setIsStandalone(standalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // For iOS, we can always show the option since it provides instructions
    if (iOS && !standalone) {
      setCanInstall(true);
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (isIOS) {
      alert(
        "Para instalar o app:\n\n" +
          "1. Toque no ícone de compartilhar (⬆️)\n" +
          "2. Selecione 'Adicionar à Tela Inicial'\n" +
          "3. Toque em 'Adicionar'"
      );
      return;
    }

    if (!deferredPrompt) return;

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === "accepted") {
        setCanInstall(false);
      }

      setDeferredPrompt(null);
    } catch (error) {
      console.error("Error during installation:", error);
    }
  }, [deferredPrompt, isIOS]);

  return {
    canInstall: canInstall && !isStandalone,
    isIOS,
    promptInstall,
  };
}
