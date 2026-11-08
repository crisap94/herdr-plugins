import { theme } from "herdr";

const HEX_BASE = 7;

export function tokens() {
  const t = theme();
  return {
    bg: t.background, chrome: t.chrome, surface: t.surface, raised: t.raised, hover: t.hover, selected: t.selected, border: t.border,
    fg: t.foreground, muted: t.muted, dim: t.dim, accent: t.accent, onAccent: t.accent_foreground,
    blocked: t.blocked, working: t.working, done: t.ansi2, idle: t.idle, unknown: t.unknown, violet: t.ansi5,
  };
}

export const tint = (color, alpha) => `${color.slice(0, HEX_BASE)}${alpha}`;
