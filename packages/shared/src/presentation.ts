// Presentation helpers never participate in authoritative playback state.
export function avatarIdentity(name: string) {
  let hash = 2166136261;
  for (const char of name.normalize("NFKC").toLowerCase())
    hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  const words = name.trim().split(/\s+/u);
  const initials = (words.length > 1 ? [words[0]!, words.at(-1)!] : words).map((word) => Array.from(word)[0] ?? "").join("").toUpperCase();
  return { initials: initials || "?", color: (hash >>> 0) % 6 };
}
export function emojiOnlyCount(text: string): number {
  const parts = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text.trim().replace(/\s/gu, "")), (item) => item.segment);
  if (!parts.length || parts.length > 3) return 0;
  const emoji = /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)$/u;
  return parts.every((part) => emoji.test(part)) ? parts.length : 0;
}
export function plainComposerText(text: string): string {
  return Array.from(text.replace(/\r\n?/g, "\n")).filter((char) => char === "\n" || char === "\t" || char.codePointAt(0)! >= 32 && char !== "\x7f").join("").slice(0, 500);
}
export function activeSpeakerIds<T extends { id: string; speaking: boolean }>(people: T[]): string[] {
  return people.filter((person) => person.speaking).slice(0, 3).map((person) => person.id);
}
