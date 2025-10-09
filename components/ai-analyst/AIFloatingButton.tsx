"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AIFloatingButtonProps {
  onClick: () => void;
  isOpen: boolean;
}

export function AIFloatingButton({ onClick, isOpen }: AIFloatingButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "fixed bottom-6 right-6 z-50 h-14 rounded-full shadow-lg transition-all duration-300",
        "bg-gradient-to-r from-primary to-gray-800 hover:from-primary/90 hover:to-gray-900",
        "text-white font-semibold",
        isOpen ? "w-14" : isHovered ? "w-auto px-6" : "w-14 px-0"
      )}
      size="lg"
    >
      <Sparkles className={cn("h-6 w-6", isOpen || !isHovered ? "" : "mr-2")} />
      {!isOpen && isHovered && (
        <span className="whitespace-nowrap">Analista IA</span>
      )}
    </Button>
  );
}
