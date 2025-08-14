"use client";

import React from "react";
import { usePermissions } from "@/hooks/usePermissions";

interface PartnersGlobalHeaderProps {
  title?: string | React.ReactNode;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PartnersGlobalHeader({
  title,
  description,
  children,
  className = "",
}: PartnersGlobalHeaderProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with title */}
      <div className="flex flex-col gap-4">
        <div className="flex-1">
          {title && (
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">
              {title}
            </h1>
          )}
          {description && (
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Custom children content */}
      {children}
    </div>
  );
}
