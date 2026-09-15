"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function getToday() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// Rendered on the client only so the date matches the user's timezone.
export function TodayLabel() {
  const today = useSyncExternalStore(subscribe, getToday, () => "");
  return <span suppressHydrationWarning>{today || " "}</span>;
}
