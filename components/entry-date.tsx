"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { addDays, fromDay, toDay } from "@/lib/day";
import { cn } from "@/lib/utils";

function label(day: string | null) {
  if (!day) return "Today";
  const today = new Date();
  if (day === toDay(today)) return "Today";
  if (day === toDay(addDays(today, -1))) return "Yesterday";
  const date = fromDay(day);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== today.getFullYear() && { year: "numeric" }),
  });
}

// The day the entry is for, as "YYYY-MM-DD"; null means today. A pill that
// opens a calendar, limited to today and earlier.
export function EntryDate({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (day: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  function pick(date: Date) {
    const day = toDay(date);
    onChange(day === toDay(new Date()) ? null : day);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-7 gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
              value && "text-foreground"
            )}
            aria-label={`Entry date: ${label(value)}`}
          />
        }
      >
        <CalendarIcon className="size-3.5" aria-hidden />
        {label(value)}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <EntryCalendar value={value} onPick={pick} />
      </PopoverContent>
    </Popover>
  );
}

// Only rendered while the popover is open, so "today" is the viewer's own.
function EntryCalendar({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (date: Date) => void;
}) {
  const today = new Date();
  const selected = value ? fromDay(value) : today;

  return (
    <Calendar
      mode="single"
      required
      selected={selected}
      defaultMonth={selected}
      onSelect={onPick}
      disabled={{ after: today }}
      endMonth={today}
      weekStartsOn={1}
    />
  );
}
