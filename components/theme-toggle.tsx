"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { SegmentedControl } from "@/components/segmented-control";
import { setTheme, type Theme } from "@/lib/theme";

// The inline theme script owns <html data-theme>; mirror it here.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

const getTheme = () =>
  (document.documentElement.dataset.theme as Theme | undefined) ?? "system";

const OPTIONS: { value: Theme; title: string; label: ReactNode }[] = [
  { value: "system", title: "System theme", label: <MonitorIcon className="size-3.5" /> },
  { value: "light", title: "Light theme", label: <SunIcon className="size-3.5" /> },
  { value: "dark", title: "Dark theme", label: <MoonIcon className="size-3.5" /> },
];

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, (): Theme => "system");

  return (
    <SegmentedControl
      name="Theme"
      value={theme}
      options={OPTIONS}
      onChange={setTheme}
      itemClassName="px-2.5"
    />
  );
}
