import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { Play } from "lucide-react";
import { avatarIdentity, brand } from "@watchparty/shared";
import type { AudioLevels } from "../AudioLevels.js";
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
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`chip ${className}`}>{children}</span>;
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
        <Play fill="currentColor" aria-hidden="true" />
      </span>
      {brand.productName}
    </a>
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
}: {
  message: string;
  onDismiss: () => void;
}) {
  const close = useRef(onDismiss);
  close.current = onDismiss;
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => close.current(), 4500);
    return () => clearTimeout(timer);
  }, [message]);
  return message ? (
    <div className="toast" role="alert">
      <span>{message}</span>
      <Button variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  ) : null;
}
