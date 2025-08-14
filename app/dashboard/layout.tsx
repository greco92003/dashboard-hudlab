import React from "react";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PWAInstallPrompt />
    </>
  );
}
