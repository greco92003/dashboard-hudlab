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

  React.useEffect(() => {
    setRange(value);
  }, [value]);

  const handleSelect = (newRange: DateRange | undefined) => {
    setRange(newRange);
    if (onChange) {
      onChange(newRange);
    }
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
          >
            {range?.from && range?.to
              ? `${range.from.toLocaleDateString()} - ${range.to.toLocaleDateString()}`
              : "Selecionar período"}
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
