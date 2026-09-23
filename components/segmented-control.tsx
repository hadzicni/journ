"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

// An iOS-style segmented control: the selected pill slides between options.
export function SegmentedControl<T extends string>({
  name,
  value,
  options,
  onChange,
  disabled,
  itemClassName,
}: {
  name: string;
  value: T;
  // `title` names icon-only options for tooltips and screen readers.
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  itemClassName?: string;
}) {
  return (
    <ToggleGroup
      aria-label={name}
      value={[value]}
      // Ignore attempts to deselect; one option is always active.
      onValueChange={(next) => next[0] && onChange(next[0] as T)}
      disabled={disabled}
      spacing={0}
      className="rounded-full bg-muted p-0.5"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          size="sm"
          title={option.title}
          aria-label={option.title}
          className={cn(
            "relative h-6 cursor-pointer rounded-full! px-3 text-xs text-muted-foreground hover:bg-transparent aria-pressed:bg-transparent aria-pressed:text-foreground",
            itemClassName
          )}
        >
          {option.value === value && (
            <motion.span
              layoutId={`segment-${name}`}
              className="absolute inset-0 rounded-full bg-card shadow-sm ring-1 ring-black/5 dark:bg-white/15 dark:ring-white/10"
              transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
            />
          )}
          <span className="relative flex items-center">{option.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
