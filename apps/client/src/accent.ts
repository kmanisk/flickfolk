const STORAGE_KEY = "flickfolk-accent";
export const DEFAULT_ACCENT = "#f2b05e";
const LEGACY_MINT = "#7cc6a4";
const BG = "#120f10";
const DARK_TEXT = "#1a0d0b";
const LIGHT_TEXT = "#f5efe8";

export const ACCENT_PRESETS = [
  { name: "Amber", value: "#f2b05e" },
  { name: "Coral", value: "#ff7a59" },
  { name: "Blue", value: "#7aa8e6" },
  { name: "Lilac", value: "#c49be8" },
  { name: "Pink", value: "#e88fb3" },
] as const;

function valid(value: string | null | undefined) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}
function rgb(hex: string) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}
function hex(parts: number[]) {
  return `#${parts.map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}
function luminance(value: string) {
  const channels = rgb(value).map((part) => part / 255);
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
function mixWithWhite(value: string, amount: number) {
  return hex(rgb(value).map((part) => part + (255 - part) * amount));
}
export function accessibleAccent(value: string | null | undefined) {
  let accent = valid(value) ?? DEFAULT_ACCENT;
  if (accent === LEGACY_MINT) accent = DEFAULT_ACCENT;
  for (let i = 0; i < 20 && contrast(accent, BG) < 4.5; i += 1)
    accent = mixWithWhite(accent, 0.08);
  return accent;
}
function accentText(accent: string) {
  return contrast(accent, DARK_TEXT) >= contrast(accent, LIGHT_TEXT)
    ? DARK_TEXT
    : LIGHT_TEXT;
}
function applyThemeColor(accent: string) {
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", accent);
}
export function applyAccent(value: string | null | undefined) {
  const accent = accessibleAccent(value);
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-text", accentText(accent));
  document.documentElement.dataset.accent = accent.slice(1);
  applyThemeColor(accent);
  return accent;
}
function announce(accent: string) {
  window.dispatchEvent(new CustomEvent("flickfolk:accent", { detail: accent }));
  return accent;
}
export function loadAccent() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const accent = applyAccent(stored);
    if (stored && accessibleAccent(stored) !== stored.toLowerCase())
      localStorage.setItem(STORAGE_KEY, accent);
    return accent;
  } catch {
    return applyAccent(DEFAULT_ACCENT);
  }
}
export function currentAccent() {
  const inline = document.documentElement.style.getPropertyValue("--accent").trim();
  if (inline) return accessibleAccent(inline);
  try {
    return accessibleAccent(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_ACCENT;
  }
}
export function saveAccent(value: string) {
  const accent = applyAccent(value);
  try { localStorage.setItem(STORAGE_KEY, accent); } catch { /* optional */ }
  return announce(accent);
}
export function resetAccent() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* optional */ }
  return announce(applyAccent(DEFAULT_ACCENT));
}
export const ACCENT_STORAGE_KEY = STORAGE_KEY;
