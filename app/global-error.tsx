"use client";

import React, { useEffect } from "react";
import { storage } from "@/lib/storage";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);

    // Clear all cache when there's a global error to prevent state conflicts
    if (typeof window !== "undefined") {
      try {
        // Clear localStorage
        storage.clear();
        // Clear sessionStorage
        sessionStorage.clear();
        // Clear cookies (optional, but helps with auth issues)
        document.cookie.split(";").forEach((c) => {
          const eqPos = c.indexOf("=");
          const name = eqPos > -1 ? c.substr(0, eqPos) : c;
          document.cookie =
            name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        });
      } catch (err) {
        console.warn("Failed to clear cache:", err);
      }
    }
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center">
          <div className="mx-auto max-w-md text-center">
            <h2 className="mb-4 text-2xl font-bold">Something went wrong!</h2>
            <p className="mb-6 text-gray-600">
              We apologize for the inconvenience. Please try again or contact
              support if the issue persists.
            </p>
            <div className="space-y-4">
              <button
                onClick={() => {
                  // Clear cache before reset
                  if (typeof window !== "undefined") {
                    try {
                      storage.clear();
                      sessionStorage.clear();
                    } catch (err) {
                      console.warn("Failed to clear cache on reset:", err);
                    }
                  }
                  reset();
                }}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
              >
                Try again
              </button>
              <button
                onClick={() => {
                  // Force reload the page to clear all state
                  window.location.reload();
                }}
                className="ml-2 rounded-md bg-secondary px-4 py-2 text-secondary-foreground hover:bg-secondary/90"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
