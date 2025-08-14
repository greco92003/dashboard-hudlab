"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface PWASplashScreenProps {
  onComplete?: () => void;
  duration?: number; // Duration in milliseconds
  className?: string;
}

export function PWASplashScreen({
  onComplete,
  duration = 2000,
  className,
}: PWASplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Start animation after a brief delay
    const animationTimer = setTimeout(() => {
      setIsAnimating(true);
    }, 100);

    // Hide splash screen after duration
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, duration);

    return () => {
      clearTimeout(animationTimer);
      clearTimeout(hideTimer);
    };
  }, [duration, onComplete]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center bg-black",
        "transition-opacity duration-500",
        isAnimating ? "opacity-100" : "opacity-0",
        className
      )}
    >
      <div className="flex flex-col items-center justify-center space-y-6">
        {/* Logo */}
        <div
          className={cn(
            "transition-all duration-1000 ease-out",
            isAnimating
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-95 translate-y-4"
          )}
        >
          <div className="relative w-24 h-24 md:w-32 md:h-32">
            <Image
              src="/icons/icon-128x128.png"
              alt="HudLab Logo"
              width={128}
              height={128}
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* App Name */}
        <div
          className={cn(
            "transition-all duration-1000 ease-out delay-300",
            isAnimating
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          )}
        >
          <h1 className="text-white text-xl md:text-2xl font-semibold text-center">
            HudLab Dashboard
          </h1>
          <p className="text-gray-400 text-sm md:text-base text-center mt-2">
            Gestão e análise de vendas
          </p>
        </div>

        {/* Loading indicator */}
        <div
          className={cn(
            "transition-all duration-1000 ease-out delay-500",
            isAnimating
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          )}
        >
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-white rounded-full animate-pulse delay-75"></div>
            <div className="w-2 h-2 bg-white rounded-full animate-pulse delay-150"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook to detect if app was launched from home screen (PWA mode)
export function useIsPWA() {
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (PWA)
    const isStandalone = window.matchMedia(
      "(display-mode: standalone)"
    ).matches;
    // Check if launched from home screen on iOS
    const isIOSStandalone = (window.navigator as any).standalone === true;
    // Check if running in PWA mode
    const isPWAMode = isStandalone || isIOSStandalone;

    setIsPWA(isPWAMode);
  }, []);

  return isPWA;
}

// Hook to show splash screen only on first PWA launch
export function usePWASplashScreen() {
  const [showSplash, setShowSplash] = useState(false);
  const isPWA = useIsPWA();

  useEffect(() => {
    if (isPWA) {
      // Check if splash was already shown in this session
      const splashShown = sessionStorage.getItem("pwa-splash-shown");

      if (!splashShown) {
        setShowSplash(true);
        sessionStorage.setItem("pwa-splash-shown", "true");
      }
    }
  }, [isPWA]);

  const hideSplash = () => {
    setShowSplash(false);
  };

  return { showSplash, hideSplash, isPWA };
}
