"use client";

interface PWAWrapperProps {
  children: React.ReactNode;
}

// Splash screen is handled natively by iOS via apple-touch-startup-image.
// A React-based splash always loads AFTER JS, causing a content flash.
export function PWAWrapper({ children }: PWAWrapperProps) {
  return <>{children}</>;
}
