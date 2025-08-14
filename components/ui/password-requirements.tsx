"use client";

import React from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordRequirementsProps {
  password: string;
  className?: string;
  showOnlyLength?: boolean;
}

export function PasswordRequirements({
  password,
  className,
  showOnlyLength = false,
}: PasswordRequirementsProps) {
  const hasMinLength = password.length >= 8;
  const hasLowerCase = /[a-z]/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);

  if (!password) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        A senha deve ter pelo menos 8 caracteres
      </p>
    );
  }

  if (showOnlyLength) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {hasMinLength ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <X className="h-4 w-4 text-red-500" />
        )}
        <span
          className={cn(
            "text-sm",
            hasMinLength ? "text-green-600" : "text-red-500"
          )}
        >
          Pelo menos 8 caracteres
        </span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        {hasMinLength ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <X className="h-4 w-4 text-gray-400" />
        )}
        <span
          className={cn(
            "text-sm",
            hasMinLength ? "text-green-600" : "text-gray-500"
          )}
        >
          Pelo menos 8 caracteres
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {hasLowerCase ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <X className="h-4 w-4 text-gray-400" />
        )}
        <span
          className={cn(
            "text-sm",
            hasLowerCase ? "text-green-600" : "text-gray-500"
          )}
        >
          Uma letra minúscula
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {hasUpperCase ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <X className="h-4 w-4 text-gray-400" />
        )}
        <span
          className={cn(
            "text-sm",
            hasUpperCase ? "text-green-600" : "text-gray-500"
          )}
        >
          Uma letra maiúscula
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {hasNumber ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <X className="h-4 w-4 text-gray-400" />
        )}
        <span
          className={cn(
            "text-sm",
            hasNumber ? "text-green-600" : "text-gray-500"
          )}
        >
          Um número
        </span>
      </div>
    </div>
  );
}
