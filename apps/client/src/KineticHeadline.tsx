import { useEffect, useState } from "react";

const phrases = ["Same second.", "Same laugh.", "Same gasp.", "Together."];
export function KineticHeadline() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    function update() {
      clearInterval(timer);
      timer = undefined;
      if (motion.matches) setActive(0);
      else if (!document.hidden)
        timer = setInterval(
          () => setActive((i) => (i + 1) % phrases.length),
          3600,
        );
    }
    update();
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
    };
  }, []);
  return (
    <h1 className="kinetic-headline" aria-label="Same movie. Same second.">
      <span aria-hidden="true">Same movie.</span>
      <span className="kinetic-line" aria-hidden="true">
        {phrases.map((phrase, i) => (
          <span
            key={phrase}
            className={i === active ? "phrase is-active" : "phrase"}
            data-active={i === active}
          >
            {phrase}
          </span>
        ))}
      </span>
    </h1>
  );
}
