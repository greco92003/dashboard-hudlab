"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { type DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Calendar23Props {
  value?: DateRange | undefined;
  onChange?: (range: DateRange | undefined) => void;
  hideLabel?: boolean;
}

export default function Calendar23({
  value,
  onChange,
  hideLabel = false,
}: Calendar23Props) {
  const [range, setRange] = React.useState<DateRange | undefined>(value);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    setRange(value);
  }, [value]);

  const handleSelect = (newRange: DateRange | undefined) => {
    setRange(newRange);
    if (onChange) {
      onChange(newRange);
    }
  };

  // Format date display text
  const getDisplayText = () => {
    if (!mounted) {
      return "Selecionar período";
    }
    if (range?.from && range?.to) {
      return `${range.from.toLocaleDateString()} - ${range.to.toLocaleDateString()}`;
    }
    return "Selecionar período";
  };

  return (
    <div className="flex flex-col gap-3">
      {!hideLabel && (
        <Label htmlFor="dates" className="px-1">
          Selecione o período desejado:
        </Label>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            id="dates"
            className="w-56 justify-between font-normal"
            suppressHydrationWarning
          >
            <span suppressHydrationWarning>{getDisplayText()}</span>
            <ChevronDownIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="range"
            selected={range}
            captionLayout="dropdown"
            onSelect={handleSelect}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
