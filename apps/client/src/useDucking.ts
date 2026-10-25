import { useEffect, useRef, useState } from "react";
import { duckTarget, volumeRamp } from "@watchparty/shared";
export function useDucking(
  video: React.RefObject<HTMLVideoElement | null>,
  youtube: React.RefObject<YT.Player | null>,
  ready: boolean,
  mediaId: string | undefined,
  speaking: boolean,
  enabled: boolean,
  muted: boolean,
) {
  const [baseVolume, setBase] = useState(1);
  const base = useRef(1);
  const initialized = useRef(false);
  const expected = useRef<number | null>(null);
  const wroteAt = useRef(-Infinity);
  const frame = useRef<number | null>(null);
  const current = useRef({ speaking, enabled, muted });
  current.current = { speaking, enabled, muted };
  const read = () => {
    try {
      return (
        video.current?.volume ??
        (typeof youtube.current?.getVolume === "function"
          ? youtube.current.getVolume() / 100
          : base.current)
      );
    } catch {
      return base.current;
    }
  };
  const write = (volume: number) => {
    expected.current = volume;
    wroteAt.current = performance.now();
    if (video.current) video.current.volume = volume;
    else if (typeof youtube.current?.setVolume === "function")
      try {
        const wasMuted = youtube.current.isMuted();
        youtube.current.setVolume(volume * 100);
        if (wasMuted) youtube.current.mute();
      } catch {
        /* Volume failure must not affect playback. */
      }
  };
  const transition = useRef(() => {});
  transition.current = () => {
    if (!ready || !initialized.current) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const from = read();
    const target = duckTarget(
      base.current,
      current.current.speaking ? 1 : 0,
      current.current.enabled,
      current.current.muted,
    );
    if (!Number.isFinite(from)) return;
    if (Math.abs(from - target) < 0.000001) {
      write(target);
      frame.current = null;
      return;
    }
    const start = performance.now();
    const duration = target < from ? 100 : 380;
    const tick = (now: number) => {
      const next = volumeRamp(from, target, now - start, duration);
      write(next);
      if (now - start < duration) frame.current = requestAnimationFrame(tick);
      else frame.current = null;
    };
    frame.current = requestAnimationFrame(tick);
  };
  function choose(value: number) {
    base.current = Math.max(0, Math.min(1, value));
    setBase(base.current);
    transition.current();
  }
  function observe() {
    if (!initialized.current || performance.now() - wroteAt.current < 700)
      return;
    const actual = read();
    if (!Number.isFinite(actual) || actual < 0 || actual > 1) return;
    if (
      expected.current !== null &&
      Math.abs(actual - expected.current) < 0.011
    )
      return;
    if (Math.abs(actual - base.current) > 0.001) {
      base.current = actual;
      setBase(actual);
      transition.current();
    }
  }
  useEffect(() => {
    initialized.current = false;
    expected.current = null;
    if (!ready) return;
    const native = video.current;
    const changed = () => {
      if (!native || !initialized.current) return;
      if (
        expected.current !== null &&
        Math.abs(native.volume - expected.current) < 0.000001
      )
        return;
      base.current = native.volume;
      setBase(native.volume);
      transition.current();
    };
    native?.addEventListener("volumechange", changed);
    const volume = read();
    if (Number.isFinite(volume)) {
      base.current = Math.max(0, Math.min(1, volume));
      setBase(base.current);
      initialized.current = true;
      transition.current();
    }
    return () => {
      native?.removeEventListener("volumechange", changed);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      if (initialized.current) {
        write(base.current);
      }
      initialized.current = false;
    };
  }, [ready, mediaId]);
  useEffect(() => {
    transition.current();
  }, [speaking, enabled, muted]);
  return { baseVolume, choose, observe };
}
