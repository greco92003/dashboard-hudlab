import React from "react";

export default function PartnersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex-1 flex flex-col h-screen">
        {children}
      </div>
    </div>
  );
}
