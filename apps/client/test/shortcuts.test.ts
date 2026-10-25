import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isTextEntryTarget, registerShortcuts } from "../src/lib/shortcuts.js";
class FakeElement {
  tagName = "BUTTON";
  isContentEditable = false;
  type = "";
  closest(selector: string) {
    return selector === "input, textarea" &&
      ["INPUT", "TEXTAREA"].includes(this.tagName)
      ? this
      : null;
  }
}
class FakeInput extends FakeElement {
  tagName = "INPUT";
}
const disposers: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("HTMLInputElement", FakeInput);
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => {
  disposers.splice(0).forEach((stop) => stop());
  vi.unstubAllGlobals();
});
it.each(["text", "search", "url", "email", "password", "number", "tel"])(
  "suppresses typing in %s inputs",
  (type) => {
    const input = Object.assign(new FakeInput(), { type });
    expect(isTextEntryTarget(input as unknown as EventTarget)).toBe(true);
  },
);
it.each(["range", "button", "checkbox", "radio", "submit"])(
  "keeps shortcuts on %s inputs",
  (type) => {
    const input = Object.assign(new FakeInput(), { type });
    expect(isTextEntryTarget(input as unknown as EventTarget)).toBe(false);
  },
);
it.each(["BUTTON", "A", "VIDEO", "DIV"])(
  "keeps shortcuts on %s elements",
  (tagName) => {
    expect(
      isTextEntryTarget(
        Object.assign(new FakeElement(), { tagName }) as unknown as EventTarget,
      ),
    ).toBe(false);
  },
);
it("suppresses textarea and editable content", () => {
  expect(
    isTextEntryTarget(
      Object.assign(new FakeElement(), {
        tagName: "TEXTAREA",
      }) as unknown as EventTarget,
    ),
  ).toBe(true);
  expect(
    isTextEntryTarget(
      Object.assign(new FakeElement(), {
        isContentEditable: true,
      }) as unknown as EventTarget,
    ),
  ).toBe(true);
});
it("shares one dispatcher, cancels Space defaults and cleans up subscribers", () => {
  const play = vi.fn();
  const copy = vi.fn();
  const stop = registerShortcuts({ " ": play });
  disposers.push(stop, registerShortcuts({ c: copy }));
  const press = (key: string, extra = {}) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), {
      key,
      ...extra,
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(press(" ")).toBe(true);
  expect(play).toHaveBeenCalledTimes(1);
  expect(press("C")).toBe(true);
  expect(copy).toHaveBeenCalledTimes(1);
  expect(press("c", { isComposing: true })).toBe(false);
  expect(press("c", { ctrlKey: true })).toBe(false);
  expect(press("c", { repeat: true })).toBe(false);
  expect(press("Enter")).toBe(false);
  expect(press("ArrowRight")).toBe(false);
  stop();
  expect(press(" ")).toBe(false);
});
