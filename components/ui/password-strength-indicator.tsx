"use client";

import React from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const requirements: PasswordRequirement[] = [
  {
    label: "Pelo menos 8 caracteres",
    test: (password) => password.length >= 8,
  },
  {
    label: "Pelo menos uma letra minúscula",
    test: (password) => /[a-z]/.test(password),
  },
  {
    label: "Pelo menos uma letra maiúscula",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    label: "Pelo menos um número",
    test: (password) => /\d/.test(password),
  },
];

export function PasswordStrengthIndicator({
  password,
  className,
}: PasswordStrengthIndicatorProps) {
  const passedRequirements = requirements.filter((req) => req.test(password));
  const strength = passedRequirements.length;
  const isStrong = strength >= 3; // At least 3 out of 4 requirements
  const isValid = password.length >= 8; // Minimum requirement

  const getStrengthColor = () => {
    if (strength === 0) return "bg-gray-200";
    if (strength <= 1) return "bg-red-500";
    if (strength <= 2) return "bg-yellow-500";
    if (strength <= 3) return "bg-blue-500";
    return "bg-green-500";
  };

  const getStrengthText = () => {
    if (strength === 0) return "Muito fraca";
    if (strength <= 1) return "Fraca";
    if (strength <= 2) return "Regular";
    if (strength <= 3) return "Boa";
    return "Forte";
  };

  if (!password) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Strength bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Força da senha:</span>
          <span
            className={cn(
              "text-sm font-medium",
              strength <= 1 && "text-red-600",
              strength === 2 && "text-yellow-600",
              strength === 3 && "text-blue-600",
              strength === 4 && "text-green-600"
            )}
          >
            {getStrengthText()}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              getStrengthColor()
            )}
            style={{ width: `${(strength / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Requirements list */}
      <div className="space-y-1">
        <p className="text-sm font-medium text-gray-700">Requisitos:</p>
        {requirements.map((requirement, index) => {
          const isPassed = requirement.test(password);
          return (
            <div key={index} className="flex items-center gap-2">
              {isPassed ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <X className="h-4 w-4 text-gray-400" />
              )}
              <span
                className={cn(
                  "text-sm",
                  isPassed ? "text-green-600" : "text-gray-500"
                )}
              >
                {requirement.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Validation status */}
      {password.length > 0 && (
        <div
          className={cn(
            "text-sm font-medium",
            isValid ? "text-green-600" : "text-red-600"
          )}
        >
          {isValid
            ? "✓ Senha atende aos requisitos mínimos"
            : "✗ Senha deve ter pelo menos 8 caracteres"}
        </div>
      )}
    </div>
  );
}
