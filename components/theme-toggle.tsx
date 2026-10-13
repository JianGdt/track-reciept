"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle({
  dark,
  onToggle,
  size = 18,
}: {
  dark: boolean;
  onToggle: (origin?: HTMLElement | null) => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      onClick={(event) => onToggle(event.currentTarget)}
      aria-label={dark ? "Use light theme" : "Use dark theme"}
    >
      <span className="theme-switch-icon" key={String(dark)}>
        {dark ? <Sun size={size} /> : <Moon size={size} />}
      </span>
    </button>
  );
}
