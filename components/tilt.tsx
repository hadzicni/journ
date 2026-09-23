"use client";

import { useEffect, type ReactNode } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";

import { cn } from "@/lib/utils";

const MAX_TILT = 2;
const spring = { stiffness: 120, damping: 20 };

// Leans slightly towards the mouse, with a faint light that follows it.
export function Tilt({
  children,
  disabled = false,
  className,
}: {
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  // Pointer position within the element, from 0 to 1 on each axis.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const hover = useMotionValue(0);

  const rotateY = useSpring(
    useTransform(px, [0, 1], [-MAX_TILT, MAX_TILT]),
    spring
  );
  const rotateX = useSpring(
    useTransform(py, [0, 1], [MAX_TILT, -MAX_TILT]),
    spring
  );
  const glareOpacity = useSpring(hover, spring);
  const glareX = useTransform(px, [0, 1], [0, 100]);
  const glareY = useTransform(py, [0, 1], [0, 100]);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgb(255 255 255 / 0.08), transparent 55%)`;

  function reset() {
    px.set(0.5);
    py.set(0.5);
    hover.set(0);
  }

  useEffect(() => {
    if (disabled) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return (
    <motion.div
      className={cn("relative", className)}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      onPointerMove={(e) => {
        if (disabled || e.pointerType !== "mouse") return;
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const rect = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - rect.left) / rect.width);
        py.set((e.clientY - rect.top) / rect.height);
        hover.set(1);
      }}
      onPointerLeave={reset}
    >
      {children}
      <motion.div
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit]"
        style={{ background: glare, opacity: glareOpacity }}
        aria-hidden
      />
    </motion.div>
  );
}
