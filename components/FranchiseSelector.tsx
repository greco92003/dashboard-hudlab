"use client";

import React, { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MapPin, X } from "lucide-react";
import { useFranchiseFilter } from "@/hooks/useFranchiseFilter";

interface FranchiseSelectorProps {
  className?: string;
  showLabel?: boolean;
  showBadge?: boolean;
  size?: "sm" | "default" | "lg";
  selectedBrand?: string | null;
}

export function FranchiseSelector({
  className = "",
  showLabel = true,
  showBadge = true,
  size = "default",
  selectedBrand,
}: FranchiseSelectorProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  const {
    selectedFranchise,
    setSelectedFranchise,
    availableFranchises,
    shouldShowFranchiseFilter,
    clearFranchiseFilter,
    getFranchiseDisplayName,
  } = useFranchiseFilter(selectedBrand);

  // Handle hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Don't render if not hydrated yet
  if (!isHydrated) {
    return null;
  }

  // Don't render if not Zenith brand
  if (!shouldShowFranchiseFilter) {
    return null;
  }

  const sizeClasses = {
    sm: "h-8 text-xs",
    default: "h-10 text-sm",
    lg: "h-12 text-base",
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {showLabel && (
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <label className="text-sm font-medium text-foreground">
            Franquia Zenith
          </label>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Select
          value={selectedFranchise || "all"}
          onValueChange={(value) =>
            setSelectedFranchise(value === "all" ? null : value)
          }
        >
          <SelectTrigger className={`${sizeClasses[size]} min-w-[180px]`}>
            <SelectValue placeholder="Todas as franquias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>Todas as franquias</span>
              </div>
            </SelectItem>
            {availableFranchises.map((franchise) => (
              <SelectItem key={franchise.id} value={franchise.name}>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  <span>{franchise.displayName}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedFranchise && (
          <button
            onClick={clearFranchiseFilter}
            className="p-1 hover:bg-muted rounded-md transition-colors"
            title="Limpar filtro de franquia"
          >
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {showBadge && selectedFranchise && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            <MapPin className="h-3 w-3 mr-1" />
            {getFranchiseDisplayName(selectedFranchise)}
          </Badge>
        </div>
      )}
    </div>
  );
}

// Compact version for use in headers or tight spaces
export function FranchiseSelectorCompact({
  className = "",
}: {
  className?: string;
}) {
  return (
    <FranchiseSelector
      className={className}
      showLabel={false}
      showBadge={false}
      size="sm"
    />
  );
}

// Version with badge only (no select dropdown)
export function FranchiseBadge({ className = "" }: { className?: string }) {
  const {
    selectedFranchise,
    shouldShowFranchiseFilter,
    getFranchiseDisplayName,
  } = useFranchiseFilter();

  if (!shouldShowFranchiseFilter || !selectedFranchise) {
    return null;
  }

  return (
    <Badge variant="outline" className={`text-xs ${className}`}>
      <MapPin className="h-3 w-3 mr-1" />
      {getFranchiseDisplayName(selectedFranchise)}
    </Badge>
  );
}
