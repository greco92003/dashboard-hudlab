"use client";

import React from "react";
import { GlobalHeader } from "@/components/GlobalHeader";

interface PageWrapperProps {
  title?: string | React.ReactNode;
  description?: string;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}

/**
 * Wrapper component that provides consistent page structure
 *
 * @param title - Page title (can be string or React node for icons)
 * @param description - Page description
 * @param children - Page content
 * @param className - Additional classes for the main container
 * @param headerClassName - Additional classes for the header
 * @param contentClassName - Additional classes for the content area
 */
export function PageWrapper({
  title,
  description,
  children,
  className = "",
  headerClassName = "",
  contentClassName = "",
}: PageWrapperProps) {
  return (
    <div
      className={`container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6 ${className}`}
    >
      {/* Global Header */}
      <GlobalHeader
        title={title}
        description={description}
        className={headerClassName}
      />

      {/* Content Area */}
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
