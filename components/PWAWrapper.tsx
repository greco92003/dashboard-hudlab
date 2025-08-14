"use client";

import { PWASplashScreen, usePWASplashScreen } from "./PWASplashScreen";

interface PWAWrapperProps {
  children: React.ReactNode;
}

export function PWAWrapper({ children }: PWAWrapperProps) {
  const { showSplash, hideSplash } = usePWASplashScreen();

  return (
    <>
      {showSplash && <PWASplashScreen onComplete={hideSplash} />}
      {children}
    </>
  );
}
