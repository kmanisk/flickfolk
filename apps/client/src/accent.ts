const STORAGE_KEY = "flickfolk-accent";
const DEFAULT_ACCENT = "#ff7a59";
const DARK_TEXT = "#120f10";
const LIGHT_TEXT = "#f5efe8";

export const ACCENT_PRESETS = [
  { name: "Coral", value: "#ff7a59" },
  { name: "Amber", value: "#f2b05e" },
  { name: "Mint", value: "#7cc6a4" },
  { name: "Blue", value: "#7aa8e6" },
  { name: "Lilac", value: "#c49be8" },
  { name: "Rose", value: "#e88fb3" },
] as const;

function normalize(value: string | null | undefined) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_ACCENT;
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: string, b: string) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function accentText(accent: string) {
  return contrast(accent, DARK_TEXT) >= contrast(accent, LIGHT_TEXT)
    ? DARK_TEXT
    : LIGHT_TEXT;
}

export function applyAccent(value: string | null | undefined) {
  const accent = normalize(value);
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-text", accentText(accent));
  document.documentElement.dataset.accent = accent.slice(1);
  return accent;
}

export function loadAccent() {
  try {
    return applyAccent(localStorage.getItem(STORAGE_KEY));
  } catch {
    return applyAccent(DEFAULT_ACCENT);
  }
}

export function currentAccent() {
  const inline = document.documentElement.style.getPropertyValue("--accent").trim();
  if (inline) return normalize(inline);
  try {
    return normalize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function saveAccent(value: string) {
  const accent = applyAccent(value);
  try {
    localStorage.setItem(STORAGE_KEY, accent);
  } catch {
    /* Storage is optional. */
  }
  window.dispatchEvent(new CustomEvent("flickfolk:accent", { detail: accent }));
  return accent;
}

export const ACCENT_STORAGE_KEY = STORAGE_KEY;
