"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Smartphone } from "lucide-react";
import { storage } from "@/lib/storage";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if running on iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Check if already installed (running in standalone mode)
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setIsStandalone(standalone);

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show install prompt if not already installed and not permanently dismissed
      if (!standalone) {
        const neverShowAgain = storage.getItem("pwa-install-never-show");
        if (!neverShowAgain) {
          setShowInstallPrompt(true);
        }
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Check if user has permanently dismissed the prompt
    const neverShowAgain = storage.getItem("pwa-install-never-show");
    const dismissed = storage.getItem("pwa-install-dismissed");

    // If user chose "never show again", don't show the prompt
    if (neverShowAgain) {
      setShowInstallPrompt(false);
    } else if (dismissed) {
      // For temporary dismissals, show again after 7 days
      const dismissedDate = new Date(dismissed);
      const now = new Date();
      const daysSinceDismissed =
        (now.getTime() - dismissedDate.getTime()) / (1000 * 3600 * 24);

      if (daysSinceDismissed < 7) {
        setShowInstallPrompt(false);
      }
    } else {
      // First time user - show prompt if conditions are met
      if (!standalone && (deferredPrompt || iOS)) {
        setShowInstallPrompt(true);
      }
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
    };
  }, [deferredPrompt, isStandalone]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      console.log("User accepted the install prompt");
      // Mark as never show again since user installed
      storage.setItem("pwa-install-never-show", "true");
    } else {
      console.log("User dismissed the install prompt");
    }

    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
    storage.setItem("pwa-install-dismissed", new Date().toISOString());
  };

  const handleNeverShowAgain = () => {
    setShowInstallPrompt(false);
    storage.setItem("pwa-install-never-show", "true");
    storage.removeItem("pwa-install-dismissed"); // Clean up old dismissal
  };

  // Don't show if already installed or user is on iOS without prompt support
  if (isStandalone || (!deferredPrompt && !isIOS) || !showInstallPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
      <div className="bg-background border border-border rounded-lg shadow-lg p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-sm">Instalar App</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground mb-3">
          {isIOS
            ? "Adicione este app à sua tela inicial para acesso rápido."
            : "Instale o HudLab Dashboard para uma experiência melhor."}
        </p>

        {isIOS ? (
          <div className="text-xs text-muted-foreground mb-3">
            <p>Para instalar:</p>
            <ol className="list-decimal list-inside mt-1 space-y-1">
              <li>Toque no ícone de compartilhar</li>
              <li>Selecione &quot;Adicionar à Tela Inicial&quot;</li>
              <li>Toque em &quot;Adicionar&quot;</li>
            </ol>
          </div>
        ) : (
          <Button
            onClick={handleInstallClick}
            className="w-full mb-3"
            size="sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Instalar App
          </Button>
        )}

        {/* Botão "Não mostrar mais" */}
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNeverShowAgain}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Não mostrar mais
          </Button>
        </div>
      </div>
    </div>
  );
}
