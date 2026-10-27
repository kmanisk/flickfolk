import {
  AudioLines,
  Disc3,
  Film,
  HardDrive,
  Link2,
  Music2,
  Radio,
  CirclePlay,
} from "lucide-react";
import { parseMedia, PROVIDER_NAMES, type Media } from "@watchparty/shared";
const icons = {
  video: Film,
  audio: Music2,
  youtube: CirclePlay,
  twitch: Radio,
  soundcloud: AudioLines,
  spotify: Disc3,
  kick: Radio,
  local: HardDrive,
};
export function ProviderBadge({ url }: { url: string }) {
  let media: Media | undefined;
  try {
    media = parseMedia(url);
  } catch {
    /* URL entry is incomplete until submitted. */
  }
  const Icon = media ? icons[media.kind] : Link2;
  return (
    <span className="provider-badge">
      <Icon aria-hidden="true" />
      {media
        ? media.stream === "hls"
          ? "HLS stream"
          : media.stream === "dash"
            ? "MPEG-DASH stream"
            : PROVIDER_NAMES[media.kind]
        : "Paste a media link"}
    </span>
  );
}
