import { createApp } from "../apps/server/src/server.js";
import {
  test,
  expect,
  chromium,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import { io as socketClient, type Socket } from "socket.io-client";
import {
  REACTIONS,
  type ClientEvents,
  type ServerEvents,
} from "@watchparty/shared";
import { readFileSync } from "node:fs";
const fixture = readFileSync(new URL("./fixtures/clip.webm", import.meta.url));
async function serveClip(context: BrowserContext) {
  await context.route("https://media.example/clip.webm", (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(
      route.request().headers().range ?? "",
    );
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Number(range[2]) : fixture.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      body: fixture.subarray(start, end + 1),
      contentType: "video/webm",
      headers: {
        "accept-ranges": "bytes",
        "access-control-allow-origin": "*",
        ...(range
          ? { "content-range": `bytes ${start}-${end}/${fixture.length}` }
          : {}),
      },
    });
  });
}
async function isolatedRoomServer() {
  const app = createApp();
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  const address = app.http.address();
  if (!address || typeof address === "string")
    throw new Error("No test listener");
  return { app, origin: `http://127.0.0.1:${address.port}` };
}
async function createRoom(page: Page, debug = false, origin = "/") {
  await page.goto(debug ? `${origin}?debug=1` : origin);
  await page.getByLabel("What should we call you?").fill("Alex");
  await page.getByRole("button", { name: "Start a room" }).click();
  await expect(page.getByRole("heading", { name: /Room / })).toBeVisible();
  await expect(page).toHaveURL(/\/room\/[A-HJ-NP-Z2-9]{6}(?:\?debug=1)?$/);
}
async function sourceField(page: Page) {
  const field = page.getByRole("textbox", { name: "Video URL" });
  if (!(await field.isVisible()))
    await page.getByRole("button", { name: "Change video source" }).click();
  return field;
}
test("desktop and mobile home remain accessible and fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Same movie/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Start a room" }).click();
  await expect(page.getByRole("alert")).toContainText("1–32");
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
});
test("two browsers synchronize real video, chat, reconnect and host promotion", async ({
  browser,
}) => {
  const first = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const second = await browser.newContext();
  for (const context of [first, second]) await serveClip(context);
  const host = await first.newPage();
  const guest = await second.newPage();
  let guestControlEvents = 0;
  const browserErrors: string[] = [];
  for (const page of [host, guest])
    page.on("pageerror", (error) => browserErrors.push(error.message));
  guest.on("websocket", (connection) =>
    connection.on("framesent", (event) => {
      if (String(event.payload).includes("playback:control"))
        guestControlEvents++;
    }),
  );
  try {
    await createRoom(host, true);
    const invite = host.url();
    await guest.goto(invite);
    await guest.getByLabel("What should we call you?").fill("Sam");
    await guest.getByRole("button", { name: /^Join/ }).click();
    await host.getByRole("tab", { name: /People/ }).click();
    await expect(host.getByText("Sam", { exact: true })).toBeVisible();
    await host.getByRole("tab", { name: /Chat/ }).click();
    await (await sourceField(host)).fill("https://media.example/clip.webm");
    await host.getByRole("button", { name: "Load video" }).click();
    await expect(
      host.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await expect(
      guest.getByRole("button", { name: "Play", exact: true }),
    ).toBeDisabled();
    await host.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() =>
        host
          .locator("video")
          .evaluate((v) => (v as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.2);
    const enable = guest.getByRole("button", {
      name: "Click to enable playback",
    });
    if (await enable.isVisible()) await enable.click();
    await expect
      .poll(() =>
        guest
          .locator("video")
          .evaluate((v) => (v as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.2);
    await host.getByLabel("Seek video").focus();
    await host.getByLabel("Seek video").press("End");
    await host.getByLabel("Seek video").press("ArrowLeft");
    await expect
      .poll(() =>
        guest
          .locator("video")
          .evaluate((v) => (v as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(50);
    await host.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      host.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
    await expect(guest.getByText(/^state v/)).toHaveText(
      (await host.getByText(/^state v/).textContent())!,
    );
    await expect
      .poll(() =>
        guest.locator("video").evaluate((v) => (v as HTMLVideoElement).paused),
      )
      .toBe(true);
    const a = await host
      .locator("video")
      .evaluate((v) => (v as HTMLVideoElement).currentTime);
    await expect
      .poll(async () =>
        Math.abs(
          a -
            (await guest
              .locator("video")
              .evaluate((v) => (v as HTMLVideoElement).currentTime)),
        ),
      )
      .toBeLessThan(0.3);
    const version = await host.getByText(/^state v/).textContent();
    await guest.locator("video").evaluate((element) => {
      (element as HTMLVideoElement).currentTime = 1;
    });
    await expect
      .poll(() =>
        guest
          .locator("video")
          .evaluate((element) => (element as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(50);
    await expect(host.getByText(/^state v/)).toHaveText(version!);
    expect(guestControlEvents).toBe(0);
    await host.getByLabel("Seek video").focus();
    await host.getByLabel("Seek video").press("Home");
    await expect
      .poll(() =>
        host
          .locator("video")
          .evaluate((v) => (v as HTMLVideoElement).currentTime),
      )
      .toBeLessThan(1);
    await host.locator("body").click({ position: { x: 5, y: 5 } });
    await host.keyboard.press("Space");
    await expect(
      host.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        guest
          .locator("video")
          .evaluate((element) => (element as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.2);
    await host.keyboard.press("Space");
    await expect(
      host.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        guest
          .locator("video")
          .evaluate((element) => (element as HTMLVideoElement).paused),
      )
      .toBe(true);
    await guest.getByLabel("Chat message").fill("This is our movie night.");
    await guest.getByRole("button", { name: "Send message" }).click();
    await expect(
      host.getByRole("log").getByText("This is our movie night."),
    ).toBeVisible();
    await second.setOffline(true);
    await expect(guest.getByRole("status")).toContainText(/reconnecting/i);
    await second.setOffline(false);
    await expect(guest.getByRole("status")).not.toContainText(
      /reconnecting|offline|rejoining/i,
    );
    await expect(
      guest.getByRole("log").getByText("This is our movie night."),
    ).toBeVisible();
    await host.screenshot({
      path: "test-results/room-desktop.png",
      fullPage: true,
    });
    await host.getByRole("button", { name: /Leave room/ }).click();
    await expect(guest.getByText("You have the remote")).toBeVisible();
    await guest.setViewportSize({ width: 390, height: 844 });
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await guest.screenshot({
      path: "test-results/room-mobile.png",
      fullPage: true,
    });
    expect(browserErrors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});

test("room lookup maps waiting, tuning, found and no signal and aborts stale requests", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  await page.route("**/api/rooms/*", async (route) => {
    const code = route.request().url().split("/").at(-1);
    if (code === "ABC234") {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route
        .fulfill({ json: { code, participants: 2, capacity: 24 } })
        .catch(() => {});
    } else if (code === "DEF567")
      await route.fulfill({ json: { code, participants: 3, capacity: 24 } });
    else await route.fulfill({ status: 404, json: { error: "No signal." } });
  });
  await page.goto("/");
  const lookup = page.getByTestId("room-lookup");
  await expect(lookup).toHaveText("waiting");
  await page.getByLabel("Room code or invite link").fill("ABC234");
  await expect(lookup).toHaveText("Checking…");
  await page.getByLabel("Room code or invite link").fill("DEF567");
  await expect(lookup).toContainText("Room found");
  release?.();
  await expect(lookup).toContainText("Room found");
  await expect(page.locator(".home-preview")).toContainText("DEF567");
  await page.getByLabel("Room code or invite link").fill("ZZZZZZ");
  await expect(lookup).toHaveText("Room not found. Check the code.");
  await page.getByLabel("Room code or invite link").fill("");
  await expect(lookup).toHaveText("waiting");
  await expect(page.getByTestId("drift")).toHaveCount(0);
});

test("tabs, keyboard, copy feedback, reduced motion and no-signal page", async ({
  browser,
}) => {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  try {
    await createRoom(page);
    await page.getByRole("tab", { name: /People/ }).click();
    await expect(page.getByRole("tabpanel")).toContainText("HOST");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("/");
    await expect(page.getByLabel("Chat message")).toBeFocused();
    await page.keyboard.type("space f c /");
    await expect(page.getByLabel("Chat message")).toHaveValue("space f c /");
    await page.getByLabel("Chat message").blur();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("c");
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
    expect(
      await page
        .locator(".screen-fx")
        .evaluate((element) => getComputedStyle(element).display),
    ).toBe("none");
    await serveClip(context);
    await (await sourceField(page)).fill("https://media.example/clip.webm");
    await page.getByRole("button", { name: "Load video" }).click();
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator("video")
          .evaluate((v) => (v as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.05);
    await page.getByRole("button", { name: "Audio settings" }).click();
    await page.getByRole("button", { name: "Effects on", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Effects off", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(consoleErrors).toEqual([]);
    const response = await page.goto("/lost-channel");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Room not found." }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("unavailable direct media shows an error and no invented drift", async ({
  page,
}) => {
  await page.route("https://media.example/unavailable.webm", (route) =>
    route.fulfill({ status: 404, body: "Unavailable" }),
  );
  await createRoom(page);
  await (
    await sourceField(page)
  ).fill("https://media.example/unavailable.webm");
  await page.getByRole("button", { name: "Load video" }).click();
  await expect(page.getByRole("alert")).toContainText("Video could not load");
  await expect(page.getByTestId("drift")).toHaveText("--");
});

test("fullscreen button and F toggle both ways and track Escape", async ({
  page,
}) => {
  await createRoom(page);
  await page
    .getByRole("button", { name: "Fullscreen player", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Exit fullscreen" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("f");
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.keyboard.press("f");
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
  await page.keyboard.press("f");
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  // Browser Escape is equivalent to the document leaving fullscreen externally.
  await page.evaluate(() => document.exitFullscreen());
  await expect(
    page.getByRole("button", { name: "Fullscreen player", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("three participants stay aligned through play, pause, seek and late join", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  for (const context of contexts) await serveClip(context);
  const [host, second, late] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  if (!host || !second || !late) throw new Error("Missing browser page");
  const position = (page: Page) =>
    page
      .locator("video")
      .evaluate((element) => (element as HTMLVideoElement).currentTime);
  async function join(page: Page, name: string, invite: string) {
    await page.goto(invite);
    await page.getByLabel("What should we call you?").fill(name);
    await page.getByRole("button", { name: /^Join/ }).click();
    await expect(page.getByRole("heading", { name: /Room / })).toBeVisible();
  }
  try {
    await createRoom(host);
    const invite = host.url();
    await join(second, "Sam", invite);
    await (await sourceField(host)).fill("https://media.example/clip.webm");
    await host.getByRole("button", { name: "Load video" }).click();
    await host.getByRole("button", { name: "Play", exact: true }).click();
    await host.getByLabel("Seek video").focus();
    await host.getByLabel("Seek video").press("ArrowRight");
    await expect.poll(() => position(host)).toBeGreaterThan(0.5);
    await join(late, "Jordan", invite);
    for (const page of [second, late]) {
      const enable = page.getByRole("button", {
        name: "Click to enable playback",
      });
      if (await enable.isVisible()) await enable.click();
      await expect.poll(() => position(page)).toBeGreaterThan(0.5);
      await expect(
        page.getByRole("button", { name: "Pause", exact: true }),
      ).toBeDisabled();
    }
    await expect
      .poll(async () => {
        const values = await Promise.all([host, second, late].map(position));
        return Math.max(...values) - Math.min(...values);
      })
      .toBeLessThan(0.3);
    await host.getByRole("button", { name: "Pause", exact: true }).click();
    for (const page of [host, second, late])
      await expect
        .poll(() =>
          page
            .locator("video")
            .evaluate((element) => (element as HTMLVideoElement).paused),
        )
        .toBe(true);
    await host.getByLabel("Seek video").focus();
    await host.getByLabel("Seek video").press("End");
    for (const page of [second, late])
      await expect.poll(() => position(page)).toBeGreaterThan(59);
    await host.getByRole("tab", { name: /People/ }).click();
    await expect(host.getByText("Sam", { exact: true })).toBeVisible();
    await expect(host.getByText("Jordan", { exact: true })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("J K L use host commands and guests cannot control playback", async ({
  browser,
}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  await serveClip(a);
  await serveClip(b);
  const host = await a.newPage();
  const guest = await b.newPage();
  const commands: { action: string; position: number }[] = [];
  host.on("websocket", (ws) =>
    ws.on("framesent", (e) => {
      const raw = String(e.payload);
      if (raw.includes("playback:control")) {
        const json = raw.slice(raw.indexOf("["));
        commands.push(JSON.parse(json)[1]);
      }
    }),
  );
  let guestCommands = 0;
  guest.on("websocket", (ws) =>
    ws.on("framesent", (e) => {
      if (String(e.payload).includes("playback:control")) guestCommands++;
    }),
  );
  try {
    await createRoom(host);
    await guest.goto(host.url());
    await guest.getByLabel("What should we call you?").fill("Sam");
    await guest.getByRole("button", { name: /^Join/ }).click();
    await (await sourceField(host)).fill("https://media.example/clip.webm");
    await host.getByRole("button", { name: "Load video" }).click();
    await expect(
      host.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await host.locator("body").click({ position: { x: 5, y: 5 } });
    await host.keyboard.press("l");
    await expect.poll(() => commands.at(-1)?.position).toBe(10);
    await host.keyboard.press("j");
    await expect.poll(() => commands.at(-1)?.position).toBe(0);
    await host.keyboard.press("k");
    await expect.poll(() => commands.at(-1)?.action).toBe("play");
    await expect(
      host.getByRole("button", { name: "Pause", exact: true }),
    ).toBeEnabled();
    await host.keyboard.press("k");
    await expect.poll(() => commands.at(-1)?.action).toBe("pause");
    await guest.locator("body").click({ position: { x: 5, y: 5 } });
    for (const key of ["j", "k", "l"]) await guest.keyboard.press(key);
    expect(guestCommands).toBe(0);
    await host.getByLabel("Chat message").fill("jklxm");
    expect(commands).toHaveLength(4);
    await host.getByLabel("Chat message").blur();
    await host.locator("body").click({ position: { x: 5, y: 5 } });
    await host.keyboard.press("x");
    await host.getByRole("button", { name: "Audio settings" }).click();
    await expect(
      host.getByRole("button", { name: "Effects off", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await host.keyboard.press("f");
    await expect(
      host.getByRole("button", { name: "Exit fullscreen" }),
    ).toBeVisible();
    await host.keyboard.press("Escape");
    await expect(
      host.getByRole("button", { name: "Fullscreen player", exact: true }),
    ).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});

test("GIFs, reactions, multiline chat and scroll-aware unread messages", async ({
  browser,
}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  for (const context of [a, b])
    await context.route(
      "https://media.giphy.com/media/example/giphy.gif",
      (route) =>
        route.fulfill({
          contentType: "image/gif",
          body: Buffer.from(
            "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
            "base64",
          ),
        }),
    );
  const host = await a.newPage();
  const guest = await b.newPage();
  try {
    await createRoom(host);
    await guest.goto(host.url());
    await guest.getByLabel("What should we call you?").fill("Sam");
    await guest.getByRole("button", { name: /^Join/ }).click();
    await expect(host.getByText("No messages yet")).toBeVisible();
    await host.getByLabel("Chat message").fill("first line");
    await host.getByLabel("Chat message").press("Shift+Enter");
    await host.getByLabel("Chat message").type("second line");
    await host.getByLabel("Chat message").press("Enter");
    await expect(guest.getByRole("log")).toContainText(
      "first line\nsecond line",
    );
    await host
      .getByRole("button", { name: "Emoji picker", exact: true })
      .click();
    await host.getByRole("button", { name: "Paste GIF link" }).click();
    await host
      .getByLabel("GIF URL")
      .fill("https://media.giphy.com/media/example/giphy.gif");
    await host.getByRole("button", { name: "Send GIF", exact: true }).click();
    await expect(
      guest.getByRole("img", { name: "Shared GIF or image" }),
    ).toBeVisible();
    await host.getByRole("button", { name: "React fire" }).click();
    await expect(guest.locator(".floating-reaction")).toHaveCount(1);
    await expect(guest.locator(".floating-reaction")).toHaveCount(0, {
      timeout: 4000,
    });
    await expect(guest.getByRole("log")).not.toContainText("\uD83D\uDD25");
    for (let n = 0; n < 12; n++) {
      await host
        .getByLabel("Chat message")
        .fill(
          `Message ${n}\nA compact message with enough lines.\nThird line.`,
        );
      await host.getByLabel("Chat message").press("Enter");
    }
    await expect(guest.getByRole("log")).toContainText("Message 11");
    await expect(
      guest.getByRole("button", { name: /new message/ }),
    ).toHaveCount(0);
    await guest.getByRole("log").evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    await host.getByLabel("Chat message").fill("Read this later");
    await host.getByLabel("Chat message").press("Enter");
    await expect(
      guest.getByRole("button", { name: /1 new message/ }),
    ).toBeVisible();
    expect(
      await guest.getByRole("log").evaluate((el) => el.scrollTop),
    ).toBeLessThan(10);
    await guest.getByRole("button", { name: /1 new message/ }).click();
    await expect(
      guest.getByRole("button", { name: /new message/ }),
    ).toHaveCount(0);
    await guest.getByLabel("Chat message").fill("draft");
    await guest.getByRole("tab", { name: /People/ }).click();
    await guest.getByRole("tab", { name: /Chat/ }).click();
    await expect(guest.getByLabel("Chat message")).toHaveValue("draft");
    await host
      .getByRole("button", { name: "Fullscreen player", exact: true })
      .click();
    await expect(host.getByLabel("Fullscreen reactions")).toBeVisible();
    await host
      .getByLabel("Fullscreen reactions")
      .getByRole("button", { name: "React heart" })
      .click();
    await expect(host.locator(".floating-reaction")).toHaveCount(1);
  } finally {
    await a.close();
    await b.close();
  }
});

test("audio-only voice connects with explicit permission, mute and teardown", async () => {
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const first = await browser.newContext({ permissions: ["microphone"] });
  const second = await browser.newContext({ permissions: ["microphone"] });
  for (const context of [first, second]) {
    await serveClip(context);
    await context.route("**/api/rtc-config", (route) =>
      route.fulfill({ json: { iceServers: [] } }),
    );
    await context.addInitScript(() => {
      const target = window as typeof window & {
        voiceTest: {
          peers: RTCPeerConnection[];
          streams: MediaStream[];
          requests: MediaStreamConstraints[];
        };
      };
      target.voiceTest = { peers: [], streams: [], requests: [] };
      const Native = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Native {
        constructor(config?: RTCConfiguration) {
          super(config);
          target.voiceTest.peers.push(this);
        }
      };
      const capture = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        target.voiceTest.requests.push(constraints!);
        const captured = await capture(constraints);
        // Browser fake microphones can send silent RTP. Feed deterministic audio
        // through the real peer connection to test RMS/ducking without hardware.
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const destination = context.createMediaStreamDestination();
        oscillator.frequency.value = 220;
        gain.gain.value = 0.12;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        await context.resume();
        captured.getTracks().forEach((track) => track.stop());
        const stream = destination.stream;
        for (const track of stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            stop();
            try {
              oscillator.stop();
            } catch {
              /* Already stopped. */
            }
            void context.close().catch(() => {});
          };
        }
        target.voiceTest.streams.push(stream);
        return stream;
      };
    });
  }
  const host = await first.newPage();
  const guest = await second.newPage();
  try {
    await createRoom(host);
    await guest.goto(host.url());
    await guest.getByLabel("What should we call you?").fill("Sam");
    await guest.getByRole("button", { name: /^Join/ }).click();
    await (await sourceField(host)).fill("https://media.example/clip.webm");
    await host.getByRole("button", { name: "Load video" }).click();
    await expect(
      host.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await host.locator("video").evaluate((el) => {
      (el as HTMLVideoElement).volume = 0.73;
    });
    await expect
      .poll(() => host.getByLabel("Movie volume").inputValue())
      .toBe("0.73");
    await host.getByRole("button", { name: "Play", exact: true }).click();
    const captures = (page: Page) =>
      page.evaluate(
        () =>
          (window as unknown as { voiceTest: { requests: unknown[] } })
            .voiceTest.requests.length,
      );
    expect(await captures(host)).toBe(0);
    expect(await captures(guest)).toBe(0);
    await host.locator("body").click({ position: { x: 5, y: 5 } });
    await host.keyboard.press("m");
    expect(await captures(host)).toBe(0);
    await host
      .getByRole("button", { name: "Enable microphone", exact: true })
      .click();
    await expect(
      host.getByRole("button", { name: "Mute microphone", exact: true }),
    ).toBeVisible();
    await guest
      .getByRole("button", { name: "Enable microphone", exact: true })
      .click();
    await expect(
      guest.getByRole("button", { name: "Mute microphone", exact: true }),
    ).toBeVisible();
    for (const page of [host, guest]) {
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (
                  window as unknown as {
                    voiceTest: { peers: RTCPeerConnection[] };
                  }
                ).voiceTest.peers.filter(
                  (p) => p.connectionState === "connected",
                ).length,
            ),
          { timeout: 10000 },
        )
        .toBe(1);
      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              const peers = (
                window as unknown as {
                  voiceTest: { peers: RTCPeerConnection[] };
                }
              ).voiceTest.peers;
              for (const peer of peers) {
                for (const stats of (await peer.getStats()).values()) {
                  if (
                    stats.type === "inbound-rtp" &&
                    stats.kind === "audio" &&
                    stats.packetsReceived > 0
                  )
                    return true;
                }
              }
              return false;
            }),
          { timeout: 10000 },
        )
        .toBe(true);
      expect(
        await page.evaluate(() =>
          (
            window as unknown as {
              voiceTest: { requests: MediaStreamConstraints[] };
            }
          ).voiceTest.requests.every((r) => r.video === false),
        ),
      ).toBe(true);
    }
    await expect
      .poll(
        () =>
          host
            .locator("video")
            .evaluate((el) => (el as HTMLVideoElement).volume),
        { timeout: 10000 },
      )
      .toBeLessThan(0.6);
    await expect(
      host.locator(".active-speaker").filter({ hasText: "Alex" }),
    ).toBeVisible();
    await expect(
      host.locator(".active-speaker").filter({ hasText: "Sam" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        host
          .locator(".active-speaker .person-avatar")
          .first()
          .evaluate((el) => Number(el.style.getPropertyValue("--voice-level"))),
      )
      .toBeGreaterThan(0);
    await host.getByRole("tab", { name: /People/ }).click();
    await expect(host.getByLabel("Sam: speaking")).toBeVisible();
    await host.screenshot({
      path: "test-results/ux-active-speakers-people.png",
      fullPage: true,
      animations: "disabled",
    });
    await host.locator("body").click({ position: { x: 5, y: 5 } });
    await host.keyboard.press("f");
    await expect
      .poll(() =>
        host.evaluate(
          () =>
            document.fullscreenElement?.querySelectorAll(".active-speaker")
              .length,
        ),
      )
      .toBe(2);
    await host.screenshot({
      path: "test-results/ux-fullscreen-speakers.png",
      animations: "disabled",
    });
    await host.keyboard.press("Escape");
    await host.getByRole("tab", { name: /Chat/ }).click();

    await guest
      .getByRole("button", { name: "Mute microphone", exact: true })
      .click();
    await expect
      .poll(() =>
        host.locator("video").evaluate((el) => (el as HTMLVideoElement).volume),
      )
      .toBe(0.73);
    await expect(
      host.locator(".active-speaker").filter({ hasText: "Sam" }),
    ).toHaveCount(0);
    await expect(
      host.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await host.locator(".player-shell").hover();
    await expect(host.locator(".player-shell")).toHaveClass(/controls-visible/);
    await host.getByRole("button", { name: "Mute", exact: true }).click();
    expect(
      await host
        .locator("video")
        .evaluate((el) => (el as HTMLVideoElement).muted),
    ).toBe(true);
    await guest
      .getByRole("button", { name: "Unmute microphone", exact: true })
      .click();
    await expect
      .poll(() =>
        host.locator("video").evaluate((el) => (el as HTMLVideoElement).muted),
      )
      .toBe(true);
    await host.locator("video").evaluate((el) => {
      (el as HTMLVideoElement).volume = 0;
    });
    await expect
      .poll(() => host.getByLabel("Movie volume").inputValue())
      .toBe("0");
    await host.getByRole("button", { name: "Unmute", exact: true }).click();
    expect(
      await host
        .locator("video")
        .evaluate((el) => (el as HTMLVideoElement).volume),
    ).toBe(0);
    await host.getByRole("button", { name: "Audio settings" }).click();
    await host.getByRole("button", { name: "Voice ducking: On" }).click();
    expect(
      await host.evaluate(() => localStorage.getItem("afterglow-ducking")),
    ).toBe("off");
    await host.keyboard.press("Escape");
    await expect(
      host.getByRole("dialog", { name: "Room settings" }),
    ).toHaveCount(0);
    await host.getByRole("tab", { name: /People/ }).click();
    await expect(host.getByLabel(/Sam: (speaking|live)/)).toBeVisible();
    await host.keyboard.press("m");
    await expect(
      host.getByRole("button", { name: "Unmute microphone", exact: true }),
    ).toBeVisible();
    expect(
      await host.evaluate(() =>
        (
          window as unknown as { voiceTest: { streams: MediaStream[] } }
        ).voiceTest.streams[0]!.getAudioTracks().every((t) => !t.enabled),
      ),
    ).toBe(true);
    await first.setOffline(true);
    await expect(host.getByRole("status")).toContainText(/reconnecting/i);
    await expect
      .poll(() =>
        host.evaluate(() =>
          (
            window as unknown as { voiceTest: { streams: MediaStream[] } }
          ).voiceTest.streams.every((s) =>
            s.getTracks().every((t) => t.readyState === "ended"),
          ),
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        host.evaluate(() =>
          (
            window as unknown as { voiceTest: { peers: RTCPeerConnection[] } }
          ).voiceTest.peers.every((peer) => peer.connectionState === "closed"),
        ),
      )
      .toBe(true);
    await first.setOffline(false);
    await expect(host.getByRole("status")).not.toContainText(
      /reconnecting|offline|rejoining/i,
    );
    await expect(
      host.getByRole("button", { name: "Enable microphone", exact: true }),
    ).toBeVisible();
    expect(await captures(host)).toBe(1);
    await guest.getByRole("button", { name: /Leave room/ }).click();
    expect(
      await guest.evaluate(() =>
        (
          window as unknown as { voiceTest: { streams: MediaStream[] } }
        ).voiceTest.streams.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    ).toBe(true);
  } finally {
    await browser.close();
  }
});

test("GIF picker search/select and Escape/outside click work at 360px", async ({
  page,
}) => {
  const item = {
    id: "cat",
    title: "Cat wave",
    previewUrl: "https://media.giphy.com/media/cat/100.webp",
    originalUrl: "https://media.giphy.com/media/cat/giphy.gif",
    width: 320,
    height: 240,
  };
  await page.route("**/api/gifs/*", (route) =>
    route.fulfill({ json: { available: true, gifs: [item] } }),
  );
  await page.route("https://media.giphy.com/**", (route) =>
    route.fulfill({
      contentType: "image/gif",
      body: Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      ),
    }),
  );
  await createRoom(page);
  await page.getByRole("button", { name: "Search GIFs", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search GIFs" }),
  ).toBeFocused();
  await expect(
    page.getByRole("img", { name: "Powered by GIPHY" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search GIFs" }).fill("cats");
  await expect(
    page.getByRole("button", { name: "Send Cat wave" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/ux-gif-grid-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Send Cat wave" }).click();
  await expect(page.getByRole("dialog", { name: "GIF picker" })).toHaveCount(0);
  await expect(
    page.getByRole("log").getByRole("img", { name: "Shared GIF or image" }),
  ).toBeVisible();
  await expect(page.getByRole("log").locator("a")).toHaveAttribute(
    "target",
    "_blank",
  );
  await page.getByRole("button", { name: "Search GIFs", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "GIF picker" })).toHaveCount(0);
  await page.getByRole("button", { name: "Search GIFs", exact: true }).click();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("dialog", { name: "GIF picker" })).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("optimistic reactions reconcile, cap nodes and reduce motion", async ({
  page,
  baseURL,
}) => {
  await createRoom(page);
  const code = page.url().split("/").at(-1)!;
  await page.getByRole("button", { name: "React fire" }).click();
  await expect(page.locator(".floating-reaction")).toHaveCount(1);
  await expect(page.locator(".floating-reaction")).toHaveCount(0, {
    timeout: 3000,
  });
  const clients = Array.from(
    { length: 4 },
    () =>
      socketClient(baseURL!, {
        transports: ["websocket"],
        forceNew: true,
      }) as Socket<ServerEvents, ClientEvents>,
  );
  try {
    await Promise.all(
      clients.map(
        (client, i) =>
          new Promise<void>((resolve, reject) => {
            client.on("connect", () =>
              client.emit("room:join", { code, name: `Guest${i}` }, (result) =>
                result.ok ? resolve() : reject(new Error(result.error)),
              ),
            );
            client.on("connect_error", reject);
          }),
      ),
    );
    for (const client of clients)
      for (let n = 0; n < 8; n++) {
        await new Promise<void>((resolve) =>
          client.emit("reaction:send", { symbol: REACTIONS[5] }, () =>
            resolve(),
          ),
        );
        // Volatile room events deliberately drop bursts on a busy transport.
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    await expect(page.locator(".floating-reaction")).toHaveCount(30);
    await expect(page.locator(".floating-reaction")).toHaveCount(0, {
      timeout: 3000,
    });
    await serveClip(page.context());
    await (await sourceField(page)).fill("https://media.example/clip.webm");
    await page.getByRole("button", { name: "Load video" }).click();
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator("video")
          .evaluate((v) => (v as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.05);
    await page.getByRole("button", { name: "Audio settings" }).click();
    await page.getByRole("button", { name: "Effects on", exact: true }).click();
    await page.getByRole("button", { name: "React heart" }).click();
    await expect(page.locator(".floating-reaction")).toHaveClass(
      /reaction-static/,
    );
    await expect(page.locator(".floating-reaction")).toHaveCount(0, {
      timeout: 1200,
    });
  } finally {
    clients.forEach((client) => client.disconnect());
  }
});

test("compact composer, emoji messages, source editing and normal/debug telemetry", async ({
  page,
}) => {
  await serveClip(page.context());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await createRoom(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText(/^state v/)).toHaveCount(0);
  await page.screenshot({
    path: "test-results/ux-idle-room.png",
    fullPage: true,
    animations: "disabled",
  });
  const input = page.getByLabel("Chat message");
  await input.focus();
  await input.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "<img src=x onerror=alert(1)>");
    data.setData("text/html", "<img src=x onerror=alert(1)>");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(input).toHaveValue("<img src=x onerror=alert(1)>");
  await input.press("Enter");
  await expect(page.getByRole("log")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.getByRole("log").locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Emoji picker", exact: true }).click();
  await page.getByRole("button", { name: "Insert heart" }).click();
  await input.press("Enter");
  await expect(page.locator(".emoji-count-1")).toBeVisible();
  await expect(page.locator(".emoji-count-1")).toHaveCSS("font-size", "52px");
  await (await sourceField(page)).fill("https://media.example/clip.webm");
  await page.getByRole("button", { name: "Load video" }).click();
  await expect(
    page.getByRole("button", { name: "Change video source" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Video URL")).toBeHidden();
  await page.getByRole("button", { name: "Change video source" }).click();
  await expect(page.getByLabel("Video URL")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "test-results/ux-loaded-chat.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/ux-mobile-chat.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() =>
    history.replaceState(null, "", `${location.pathname}?debug=1`),
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole("button", { name: "Audio settings" }).click();
  await expect(page.getByText(/^state v/)).toBeVisible();
});

test("active speaker overlay caps presence and clears disconnected participants", async ({
  page,
}) => {
  await createRoom(page);
  const code = page.url().split("/").pop()!;
  const clients: Socket<ServerEvents, ClientEvents>[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      const client = socketClient("http://127.0.0.1:3101", {
        forceNew: true,
      }) as Socket<ServerEvents, ClientEvents>;
      clients.push(client);
      await new Promise<void>((resolve, reject) => {
        client.on("connect", () =>
          client.emit("room:join", { code, name: `Speaker ${i}` }, (result) =>
            result.ok ? resolve() : reject(new Error(result.error)),
          ),
        );
        client.on("connect_error", reject);
      });
      await new Promise<void>((resolve, reject) =>
        client.emit(
          "voice:state",
          { joined: true, muted: false, speaking: true },
          (result) => (result.ok ? resolve() : reject(new Error(result.error))),
        ),
      );
    }
    await expect(page.locator(".active-speaker")).toHaveCount(3);
    await page.getByRole("tab", { name: /People/ }).click();
    await expect(page.getByLabel("Speaker 0: speaking")).toBeVisible();
    await page
      .getByRole("button", { name: "Fullscreen player", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.fullscreenElement?.querySelectorAll(".active-speaker")
              .length,
        ),
      )
      .toBe(3);
    for (const client of clients) client.disconnect();
    await expect(page.locator(".active-speaker")).toHaveCount(0);
  } finally {
    for (const client of clients) client.disconnect();
  }
});

test("GIF picker distinguishes unavailable, empty, throttle and retry states", async ({
  page,
}) => {
  let mode = "empty";
  await page.route("**/api/gifs/*", (route) =>
    route.fulfill(
      mode === "empty"
        ? { json: { available: true, gifs: [] } }
        : mode === "missing"
          ? { status: 503, json: { error: "GIF search unavailable" } }
          : mode === "busy"
            ? { status: 429, json: { error: "busy" } }
            : { status: 502, json: { error: "provider failed" } },
    ),
  );
  await createRoom(page);
  const open = page.getByRole("button", { name: "Search GIFs", exact: true });
  await open.click();
  await expect(page.getByText("No GIFs found.")).toBeVisible();
  await page.keyboard.press("Escape");
  mode = "busy";
  await open.click();
  await expect(
    page.getByRole("status").filter({ hasText: "busy" }),
  ).toBeVisible();
  mode = "empty";
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("No GIFs found.")).toBeVisible();
  await page.screenshot({
    path: "test-results/ux-gif-empty.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  mode = "missing";
  await open.click();
  await expect(
    page.getByText("GIF search unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search GIFs" })).toBeHidden();
  await page.keyboard.press("Escape");
  mode = "failure";
  await open.click();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
});

test("obsolete GIF searches cannot replace the latest results", async ({
  page,
}) => {
  const result = (title: string) => ({
    available: true,
    gifs: [
      {
        id: title,
        title,
        previewUrl: "https://media.giphy.com/media/cat/100.webp",
        originalUrl: "https://media.giphy.com/media/cat/giphy.gif",
        width: 320,
        height: 240,
      },
    ],
  });
  await page.route("https://media.giphy.com/**", (route) =>
    route.fulfill({
      contentType: "image/gif",
      body: Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      ),
    }),
  );
  await page.route("**/api/gifs/*", async (route) => {
    const q =
      new URL(route.request().url()).searchParams.get("q") ?? "trending";
    if (q === "old") await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ json: result(q) }).catch(() => {});
  });
  await createRoom(page);
  await page.getByRole("button", { name: "Search GIFs", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Search GIFs" });
  const obsolete = page.waitForRequest((request) =>
    request.url().includes("q=old"),
  );
  await input.fill("old");
  await obsolete;
  const aborted = page.waitForEvent("requestfailed", (request) =>
    request.url().includes("q=old"),
  );
  await input.fill("latest");
  await aborted;
  await expect(page.getByRole("button", { name: "Send latest" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send old", exact: true }),
  ).toHaveCount(0);
});

test("a pointer scrub emits only once on release, including release outside the rail", async ({
  page,
}) => {
  await serveClip(page.context());
  let seeks = 0;
  page.on("websocket", (connection) =>
    connection.on("framesent", (frame) => {
      if (String(frame.payload).includes('"action":"seek"')) seeks++;
    }),
  );
  await createRoom(page);
  await (await sourceField(page)).fill("https://media.example/clip.webm");
  await page.getByRole("button", { name: "Load video" }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  const slider = page.getByLabel("Seek video");
  const rect = (await slider.boundingBox())!;
  await page.mouse.move(rect.x + 5, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.7, rect.y + rect.height / 2, {
    steps: 15,
  });
  expect(seeks).toBe(0);
  await page.mouse.move(rect.x + rect.width + 20, rect.y + 50);
  await page.mouse.up();
  await expect.poll(() => seeks).toBe(1);
});

test("Flickfolk metadata, production cache headers and primary actions are ready", async ({
  page,
  request,
}) => {
  const response = await request.get("/");
  expect(response.headers()["cache-control"]).toContain("no-cache");
  const html = await response.text();
  expect(html).toContain("Flickfolk — Same movie. Same second.");
  expect(html).not.toContain("Afterglow");
  const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html)![1]!;
  const cached = await request.get(asset, {
    headers: { "Accept-Encoding": "gzip" },
  });
  expect(cached.headers()["cache-control"]).toContain("immutable");
  expect(cached.headers()["cache-control"]).toContain("31536000");
  expect(cached.headers()["content-encoding"]).toBe("gzip");
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const rect = (await page
      .getByRole("button", { name: "Start a room" })
      .boundingBox())!;
    expect(rect.y + rect.height).toBeLessThan(viewport.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/flickfolk-home-${viewport.width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("viewport room, grouped chat, rail toggle, keyless GIF and mobile reactions", async ({
  page,
}) => {
  const isolated = await isolatedRoomServer();
  try {
    await page.route("**/api/gifs/status", (route) =>
      route.fulfill({ json: { available: false } }),
    );
    await page.setViewportSize({ width: 1366, height: 768 });
    await createRoom(page, false, isolated.origin);
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    const code = new URL(page.url()).pathname.split("/").pop()!;
    await page.getByRole("button", { name: `Copy room code ${code}` }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      code,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Search GIFs", exact: true }),
    ).toHaveCount(0);
    const input = page.getByLabel("Chat message");
    for (const text of ["First thought", "Another thought", "One more thing"]) {
      await input.fill(text);
      await input.press("Enter");
      await expect(input).toHaveValue("");
    }
    await expect(page.getByRole("log").locator(".message")).toHaveCount(3);
    await expect(page.getByRole("log").locator(".person-avatar")).toHaveCount(
      1,
    );
    await expect(page.getByRole("log").locator(".is-grouped")).toHaveCount(2);
    await input.fill("t");
    await expect(
      page.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeVisible();
    await input.blur();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("t");
    await expect(
      page.getByRole("button", { name: "Expand sidebar" }),
    ).toBeVisible();
    await page.keyboard.press("/");
    await expect(input).toBeFocused();
    await page.screenshot({
      path: "test-results/flickfolk-chat-1366.png",
      animations: "disabled",
    });
    await page.getByRole("tab", { name: /People/ }).click();
    await expect(page.getByLabel("Alex: off")).toBeVisible();
    await page.screenshot({
      path: "test-results/flickfolk-people-1366.png",
      animations: "disabled",
    });
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    for (const button of await page.locator("button:visible").all()) {
      const rect = (await button.boundingBox())!;
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "Reactions", exact: true }).click();
    const dock = page.getByLabel("Fullscreen reactions");
    await expect(dock.getByRole("button")).toHaveCount(6);
    for (const button of await dock.getByRole("button").all()) {
      const rect = (await button.boundingBox())!;
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.y).toBeGreaterThanOrEqual(48);
    }
    await dock.getByRole("button", { name: "React fire" }).click();
    await expect(page.locator(".floating-reaction")).toHaveCount(1);
    await page.screenshot({
      path: "test-results/flickfolk-reaction-360.png",
      animations: "disabled",
    });
  } finally {
    await page.close();
    await isolated.app.shutdown();
  }
});

test("lazy mic capture is opt-in and permission denial stays a dismissible toast", async ({
  page,
}) => {
  const isolated = await isolatedRoomServer();
  try {
    await page.context().addInitScript(() => {
      const target = window as typeof window & { captureRequests: number };
      target.captureRequests = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        target.captureRequests++;
        throw new DOMException("Permission denied", "NotAllowedError");
      };
    });
    await createRoom(page, false, isolated.origin);
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { captureRequests: number })
            .captureRequests,
      ),
    ).toBe(0);
    await page
      .getByRole("button", { name: "Enable microphone", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      /microphone|permission|denied/i,
    );
    await expect(
      page.getByRole("button", { name: "Fullscreen player", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally {
    await page.close();
    await isolated.app.shutdown();
  }
});

test("websocket-first connection falls back to polling when websocket is unavailable", async ({
  page,
}) => {
  const isolated = await isolatedRoomServer();
  try {
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(url: string | URL, protocols?: string | string[]) {
          void url;
          super("ws://127.0.0.1:1", protocols);
        }
      };
    });
    let polling = 0;
    page.on("request", (request) => {
      if (request.url().includes("transport=polling")) polling++;
    });
    await page.goto(isolated.origin);
    await expect(
      page.getByRole("status").filter({ hasText: "Connected" }),
    ).toBeVisible();
    await page.waitForResponse(
      (response) =>
        response.url().includes("transport=polling") &&
        response.status() === 200,
    );
    await page.getByLabel("What should we call you?").fill("Alex");
    await page.getByRole("button", { name: "Start a room" }).click();
    await expect(page.getByRole("heading", { name: /Room / })).toBeVisible();
    expect(polling).toBeGreaterThan(0);
    await page.getByLabel("Chat message").fill("Connected through polling");
    await page.getByLabel("Chat message").press("Enter");
    await expect(page.getByRole("log")).toContainText(
      "Connected through polling",
    );
  } finally {
    await page.close();
    await isolated.app.shutdown();
  }
});

test("focused controls retain global shortcuts while text entry and native keyboard access stay intact", async ({
  page,
  browser,
}) => {
  const isolated = await isolatedRoomServer();
  const guestContext = await browser.newContext();
  const commands: { action: string; position: number }[] = [];
  page.on("websocket", (ws) =>
    ws.on("framesent", (e) => {
      const frame = String(e.payload);
      if (frame.includes('"playback:control"'))
        commands.push(JSON.parse(frame.slice(frame.indexOf("[")))[1]);
    }),
  );
  try {
    await serveClip(page.context());
    await createRoom(page, false, isolated.origin);
    await expect(page.getByText("No messages yet")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send message" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "ready?", exact: true }).click();
    await expect(page.getByRole("log").locator(".message")).toHaveCount(1);
    await expect(page.getByRole("log")).toContainText("ready?");
    const field = await sourceField(page);
    await field.fill("");
    await field.pressSequentially("jklfcmxt");
    await expect(field).toHaveValue("jklfcmxt");
    expect(commands).toHaveLength(0);
    expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(
      false,
    );
    await field.fill("https://media.example/clip.webm");
    await page.getByRole("button", { name: "Load video" }).click();
    await expect(field).toBeHidden();
    const play = page.getByRole("button", { name: "Play", exact: true });
    await expect(play).toBeEnabled();
    await play.click();
    await expect.poll(() => commands.at(-1)?.action).toBe("play");
    const playerButton = page.locator(".player-controls button").first();
    await expect(playerButton).toBeFocused();
    await playerButton.evaluate((el) =>
      el.addEventListener("keydown", (event) => event.stopPropagation()),
    );
    expect(
      await playerButton.evaluate((el) => el.matches(":focus-visible")),
    ).toBe(false);
    await page.keyboard.press("l");
    await expect
      .poll(() => commands.at(-1)?.position ?? 0)
      .toBeGreaterThanOrEqual(10);
    await page.waitForTimeout(180);
    await page.keyboard.press("j");
    await expect.poll(() => commands.at(-1)?.position ?? 100).toBeLessThan(2);
    await page.keyboard.press("k");
    await expect.poll(() => commands.at(-1)?.action).toBe("pause");
    const heart = page
      .getByLabel("Watch reactions")
      .getByRole("button", { name: "React heart" });
    await heart.click();
    await expect(heart).toBeFocused();
    expect(await heart.evaluate((el) => el.matches(":focus-visible"))).toBe(
      false,
    );
    await page.keyboard.press("Space");
    await expect.poll(() => commands.at(-1)?.action).toBe("play");
    // Space must not also activate the focused reaction button.
    await expect(page.locator(".floating-reaction")).toHaveCount(1);
    const slider = page.getByLabel("Seek video");
    await page.locator(".player-shell").hover();
    await slider.click();
    await expect(slider).toBeFocused();
    await slider.evaluate((el) =>
      el.addEventListener("keydown", (event) => event.stopPropagation()),
    );
    await page.keyboard.press("f");
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.fullscreenElement?.classList.contains("player-shell"),
        ),
      )
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect
      .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(false);
    await page.locator(".player-shell").hover();
    await slider.click();
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document.activeElement?.matches(":focus-visible"),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.activeElement!).outlineColor,
      ),
    ).toBe("rgb(255, 122, 89)");
    await slider.focus();
    await page.waitForTimeout(180);
    const beforeArrow = commands.length;
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => commands.length).toBeGreaterThan(beforeArrow);
    const chat = page.getByLabel("Chat message");
    await chat.fill("");
    const beforeTyping = commands.length;
    await chat.pressSequentially("jklfcmxt");
    await chat.press("Space");
    await expect(chat).toHaveValue("jklfcmxt ");
    expect(commands).toHaveLength(beforeTyping);
    await expect(
      page.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeVisible();
    expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(
      false,
    );
    await expect(page.getByRole("button", { name: "Send message" })).toHaveCSS(
      "background-color",
      "rgb(255, 122, 89)",
    );
    await chat.press("Enter");
    await expect(chat).toHaveValue("");
    const guest = await guestContext.newPage();
    await serveClip(guestContext);
    let guestCommands = 0;
    guest.on("websocket", (ws) =>
      ws.on("framesent", (e) => {
        if (String(e.payload).includes('"playback:control"')) guestCommands++;
      }),
    );
    await guest.goto(page.url());
    await guest.getByLabel("What should we call you?").fill("Guest");
    await guest.getByRole("button", { name: /^Join/ }).click();
    await expect(guest.getByRole("heading", { name: /Room / })).toBeVisible();
    await expect(
      guest.getByRole("button", { name: "Change video source" }),
    ).toHaveCount(0);
    await guest
      .getByLabel("Watch reactions")
      .getByRole("button", { name: "React fire" })
      .click();
    for (const key of ["Space", "j", "k", "l"]) await guest.keyboard.press(key);
    expect(guestCommands).toBe(0);
  } finally {
    await page.close();
    await guestContext.close();
    await isolated.app.shutdown();
  }
});

test("polished Home aligns containers and shows one inline join error", async ({
  page,
}) => {
  await page.route("**/api/rooms/*", (route) =>
    route.fulfill({ status: 404, json: { error: "Room not found" } }),
  );
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const brand = (await page.locator(".home-topbar .brand").boundingBox())!;
    const hero = (await page.locator(".home-intro").boundingBox())!;
    expect(Math.abs(brand.x - hero.x)).toBeLessThan(1);
    await expect(page.locator(".home-preview")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await expect(page.locator(".preview-shell")).toHaveCSS("transform", "none");
    await expect(page.locator(".preview-message")).toHaveCount(3);
    const code = page.getByLabel("Room code or invite link");
    await code.fill("ZZZZZZ");
    await expect(code).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByText("Room not found. Check the code.", { exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByText("Codes never contain 0, O, 1, I or L."),
    ).toBeVisible();
    await expect(page.locator(".join-row")).toHaveCSS(
      "border-color",
      "rgb(229, 72, 77)",
    );
    const validation = (await page.locator(".lookup-detail").boundingBox())!;
    const note = (await page.locator(".home-note").boundingBox())!;
    expect(note.y - validation.y - validation.height).toBeGreaterThanOrEqual(
      24,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() =>
        ["--bg", "--panel", "--raised", "--line"].map((key) =>
          getComputedStyle(document.documentElement)
            .getPropertyValue(key)
            .trim(),
        ),
      ),
    ).toEqual(["#120f10", "#1b1819", "#242021", "#2e2a2b"]);
    await code.fill("");
    await expect(
      page.getByText("Codes never contain 0, O, 1, I or L."),
    ).toHaveCount(0);
  }
});
