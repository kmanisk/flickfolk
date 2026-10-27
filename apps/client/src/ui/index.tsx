import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { Check, Palette } from "lucide-react";
import { avatarIdentity, brand } from "@watchparty/shared";
import type { AudioLevels } from "../AudioLevels.js";
import {
  ACCENT_PRESETS,
  ACCENT_STORAGE_KEY,
  currentAccent,
  resetAccent,
  saveAccent,
} from "../accent.js";
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost";
    danger?: boolean;
  }
>(function Button(
  { variant = "secondary", danger, className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={`button button-${variant} ${danger ? "button-danger" : ""} ${className}`}
    />
  );
});
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function IconButton({ className = "", ...props }, ref) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      title={props["aria-label"]}
      {...props}
      className={`icon-button ${className}`}
    />
  );
});
export function Chip({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...props} className={`chip ${className}`}>
      {children}
    </span>
  );
}
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}
export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="tooltip" data-tooltip={label}>
      {children}
    </span>
  );
}
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`brand-mark-icon ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        className="brand-mark-back"
        d="M8 5.8c0-1.5 1.7-2.4 2.9-1.6l9 5.8c1.2.8 1.2 2.6 0 3.4l-9 5.8C9.7 20 8 19.1 8 17.6Z"
      />
      <path
        className="brand-mark-front"
        d="M3 7.3c0-1.5 1.7-2.4 2.9-1.6l8 5.1c1.2.8 1.2 2.6 0 3.4l-8 5.1C4.7 20.1 3 19.2 3 17.7Z"
      />
    </svg>
  );
}
export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <a
      href="/"
      className="brand"
      aria-label={`${brand.productName} home`}
      onClick={
        onClick
          ? (event) => {
              event.preventDefault();
              onClick();
            }
          : undefined
      }
    >
      <span className="brand-mark">
        <BrandMark />
      </span>
      {brand.productName}
    </a>
  );
}

function AccentOptions({
  value,
  onChange,
  onReset,
}: {
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(value.toUpperCase());
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  const commitDraft = () => {
    if (/^#[0-9a-f]{6}$/i.test(draft)) onChange(draft);
    else setDraft(value.toUpperCase());
  };
  return (
    <div className="accent-control">
      <div className="accent-control-header">
        <span>Accent color</span>
        <span className="accent-value">{value.toUpperCase()}</span>
      </div>
      <div className="accent-swatches" role="radiogroup" aria-label="Accent color presets">
        {ACCENT_PRESETS.map((option) => (
          <button
            type="button"
            key={option.value}
            className="accent-swatch"
            role="radio"
            aria-checked={value === option.value}
            aria-label={option.name}
            title={option.name}
            style={{ "--swatch": option.value } as React.CSSProperties}
            onClick={() => onChange(option.value)}
          >
            {value === option.value && <Check aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="accent-custom">
        <label htmlFor="accent-custom-color">Custom</label>
        <input
          id="accent-custom-color"
          type="color"
          aria-label="Custom accent color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <label className="accent-hex-row">
        <span>Hex</span>
        <input
          className="accent-hex"
          aria-label="Accent hex color"
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft();
            }
            if (event.key === "Escape") setDraft(value.toUpperCase());
          }}
        />
      </label>
      <Button variant="ghost" className="accent-reset" onClick={onReset}>
        Reset to amber
      </Button>
    </div>
  );
}

export function AccentPicker({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [accent, setAccentState] = useState(currentAccent);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const sync = () => setAccentState(currentAccent());
    const storage = (event: StorageEvent) => {
      if (event.key === ACCENT_STORAGE_KEY) sync();
    };
    window.addEventListener("flickfolk:accent", sync);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("flickfolk:accent", sync);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const choose = (value: string) => setAccentState(saveAccent(value));
  const reset = () => setAccentState(resetAccent());
  if (inline) return <AccentOptions value={accent} onChange={choose} onReset={reset} />;
  return (
    <div className="popover-anchor accent-picker-anchor">
      <IconButton
        ref={trigger}
        className="accent-picker-button"
        aria-label="Accent color"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Palette aria-hidden="true" />
        <span className="accent-preview-dot" aria-hidden="true" />
      </IconButton>
      {open && (
        <Popover
          className="accent-picker-popover"
          label="Accent color"
          onClose={() => setOpen(false)}
          triggerRef={trigger}
        >
          <AccentOptions value={accent} onChange={choose} onReset={reset} />
        </Popover>
      )}
    </div>
  );
}
export function Avatar({
  name,
  id,
  speaking = false,
  levels,
  online = false,
  size = 32,
}: {
  name: string;
  id?: string;
  speaking?: boolean;
  levels?: AudioLevels;
  online?: boolean;
  size?: 24 | 32 | 40;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const identity = avatarIdentity(name);
  useEffect(() => {
    if (!id || !levels) return;
    return levels.subscribe(id, (value) =>
      element.current?.style.setProperty("--voice-level", String(value)),
    );
  }, [id, levels]);
  return (
    <span
      ref={element}
      aria-hidden="true"
      className={`person-avatar avatar-tone-${identity.color} avatar-size-${size} ${speaking ? "avatar-speaking" : ""}`}
    >
      {identity.initials}
      {online && <i className="online-dot" />}
    </span>
  );
}
export function AvatarStack({
  people,
  max = 4,
}: {
  people: { id: string; name: string; speaking?: boolean }[];
  max?: number;
}) {
  return (
    <div
      className="avatar-stack"
      aria-label={`${people.length} ${people.length === 1 ? "person" : "people"} in this room`}
    >
      {people.slice(0, max).map((p) => (
        <Avatar key={p.id} {...p} />
      ))}
      {people.length > max && (
        <span className="avatar-overflow">+{people.length - max}</span>
      )}
    </div>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: {
    id: string;
    label: string;
    icon?: ReactNode;
    count?: number | string;
  }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="rail-tabs"
      role="tablist"
      aria-label="Room sidebar"
      style={
        {
          "--tab-index": items.findIndex((item) => item.id === value),
        } as React.CSSProperties
      }
    >
      {items.map((item, i) => (
        <button
          type="button"
          key={item.id}
          id={`${item.id}-tab`}
          role="tab"
          aria-selected={value === item.id}
          aria-controls={`${item.id}-panel`}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              const next =
                items[
                  (i + (event.key === "ArrowRight" ? 1 : items.length - 1)) %
                    items.length
                ]!;
              onChange(next.id);
              document.getElementById(`${next.id}-tab`)?.focus();
            }
          }}
        >
          {item.icon}
          {item.label}
          {item.count !== undefined && (
            <span className="tab-count">{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
export function Popover({
  children,
  label,
  onClose,
  triggerRef,
  className = "",
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input, textarea, [tabindex="0"]',
        ) ?? [],
      );
    (focusable()[0] ?? panel.current)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key === "Tab") {
        const list = focusable();
        const first = list[0] ?? panel.current;
        const last = list.at(-1) ?? first;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !triggerRef?.current?.contains(event.target)
      )
        close.current();
    };
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", outside);
      if (
        document.activeElement === document.body ||
        panel.current?.contains(document.activeElement)
      )
        previous?.focus();
    };
  }, [triggerRef]);
  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      className={`popover popup-surface ${className}`}
    >
      {children}
    </div>
  );
}
export function Toast({
  message,
  onDismiss,
  neutral = false,
}: {
  message: string;
  onDismiss: () => void;
  neutral?: boolean;
}) {
  const close = useRef(onDismiss);
  close.current = onDismiss;
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => close.current(), 4500);
    return () => clearTimeout(timer);
  }, [message]);
  return message ? (
    <div className={`toast ${neutral ? "toast-neutral" : ""}`} role="alert">
      <span>{message}</span>
      <Button variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  ) : null;
}
