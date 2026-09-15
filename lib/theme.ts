export type Theme = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "journ-theme";

// Applies the saved theme to <html> before the first paint, and keeps
// "system" in sync when the OS appearance changes. Runs as an inline script
// in <head>, so it must be self-contained.
export const THEME_SCRIPT = `(function () {
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  function apply() {
    var theme = "system";
    try { theme = localStorage.getItem("${THEME_STORAGE_KEY}") || "system"; } catch (e) {}
    var dark = theme === "dark" || (theme === "system" && media.matches);
    root.dataset.theme = theme;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  }
  apply();
  media.addEventListener("change", apply);
  window.__journApplyTheme = apply;
})();`;

declare global {
  interface Window {
    __journApplyTheme?: () => void;
  }
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}

  const apply = () => window.__journApplyTheme?.();
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  // Cross-fade between themes where View Transitions are supported.
  if (document.startViewTransition && !reduceMotion) {
    // The browser may skip the transition (e.g. rapid clicks or a hidden
    // tab); the theme is still applied, so the rejections can be ignored.
    const transition = document.startViewTransition(apply);
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
  } else {
    apply();
  }
}
