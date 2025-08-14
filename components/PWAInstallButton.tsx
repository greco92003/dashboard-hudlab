"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, Smartphone } from "lucide-react";
import { SidebarMenuButton } from "@/components/ui/sidebar";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

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
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // For iOS, we can always show the button since it provides instructions
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

  const handleInstallClick = async () => {
    if (isIOS) {
      // For iOS, show alert with instructions
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
        console.log("User accepted the install prompt");
        setCanInstall(false);
      } else {
        console.log("User dismissed the install prompt");
      }

      setDeferredPrompt(null);
    } catch (error) {
      console.error("Error during installation:", error);
    }
  };

  // Don't show if already installed
  if (isStandalone || !canInstall) {
    return null;
  }

  return (
    <SidebarMenuButton onClick={handleInstallClick}>
      {isIOS ? (
        <Smartphone className="h-4 w-4" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      <span>Instalar App</span>
    </SidebarMenuButton>
  );
}
