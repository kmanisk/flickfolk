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
async function createRoom(page: Page) {
  await page.goto("/");
  await page.getByLabel("What should we call you?").fill("Alex");
  await page.getByRole("button", { name: "Create a room" }).click();
  await expect(page.getByRole("heading", { name: /Room / })).toBeVisible();
  await expect(page).toHaveURL(/\/room\/[A-HJ-NP-Z2-9]{6}$/);
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
  await page.getByRole("button", { name: "Create a room" }).click();
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
    await createRoom(host);
    const invite = host.url();
    await guest.goto(invite);
    await guest.getByLabel("What should we call you?").fill("Sam");
    await guest.getByRole("button", { name: /^Join/ }).click();
    await host.getByRole("tab", { name: /People/ }).click();
    await expect(host.getByText("Sam", { exact: true })).toBeVisible();
    await host.getByRole("tab", { name: /Chat/ }).click();
    await host
      .getByRole("textbox", { name: "Video URL" })
      .fill("https://media.example/clip.webm");
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
    await expect(host.getByText("This is our movie night.")).toBeVisible();
    await second.setOffline(true);
    await expect(guest.getByRole("status")).toContainText("Reconnecting");
    await second.setOffline(false);
    await expect(guest.getByRole("status")).toHaveText("Connected");
    await expect(guest.getByText("This is our movie night.")).toBeVisible();
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
  await expect(lookup).toHaveText("tuning…");
  await page.getByLabel("Room code or invite link").fill("DEF567");
  await expect(lookup).toContainText("room found / 3");
  release?.();
  await expect(lookup).toContainText("room found / 3");
  await expect(
    page.getByRole("img", { name: /CRT test card/ }),
  ).toHaveAccessibleName(/DEF567/);
  await page.getByLabel("Room code or invite link").fill("ZZZZZZ");
  await expect(lookup).toHaveText("no signal");
  await page.getByLabel("Room code or invite link").fill("");
  await expect(lookup).toHaveText("waiting");
  await expect(page.getByTestId("drift")).toHaveText("offset --");
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
    await page.getByRole("button", { name: "[fx]", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "[fx off]", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(consoleErrors).toEqual([]);
    const response = await page.goto("/lost-channel");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "No signal." }),
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
  await page
    .getByLabel("Video URL")
    .fill("https://media.example/unavailable.webm");
  await page.getByRole("button", { name: "Load video" }).click();
  await expect(page.getByRole("alert")).toContainText("Video could not load");
  await expect(page.getByTestId("drift")).toHaveText("offset --");
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
    await host.getByLabel("Video URL").fill("https://media.example/clip.webm");
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
    await host.getByLabel("Video URL").fill("https://media.example/clip.webm");
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
    await expect(
      host.getByRole("button", { name: "[fx off]", exact: true }),
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
    await expect(host.getByText("quiet in here.")).toBeVisible();
    await host.getByLabel("Chat message").fill("first line");
    await host.getByLabel("Chat message").press("Shift+Enter");
    await host.getByLabel("Chat message").type("second line");
    await host.getByLabel("Chat message").press("Enter");
    await expect(guest.getByRole("log")).toContainText(
      "first line\nsecond line",
    );
    await host.getByRole("button", { name: "More message actions" }).click();
    await host.getByRole("button", { name: "Paste GIF link" }).click();
    await host
      .getByLabel("GIF URL")
      .fill("https://media.giphy.com/media/example/giphy.gif");
    await host.getByRole("button", { name: "Send GIF", exact: true }).click();
    await expect(
      guest.getByRole("img", { name: "Shared GIF or image" }),
    ).toBeVisible();
    await host.getByRole("button", { name: "More message actions" }).click();
    await host.getByRole("button", { name: "Reactions", exact: true }).click();
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
    await expect(guest.getByRole("button", { name: /new message/ })).toHaveCount(0);
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
    await host.getByRole("button", { name: "React heart" }).click();
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
    await host.getByLabel("Video URL").fill("https://media.example/clip.webm");
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
    await expect(host.locator(".active-speaker").filter({ hasText: "Alex" })).toBeVisible();
    await expect(host.locator(".active-speaker").filter({ hasText: "Sam" })).toBeVisible();
    await expect.poll(() => host.locator(".active-speaker .person-avatar").first().evaluate((el) => Number(el.style.getPropertyValue("--voice-level")))).toBeGreaterThan(0);
    await host.getByRole("tab", { name: /People/ }).click();
    await expect(host.getByLabel("Sam: speaking")).toBeVisible();
    await host.screenshot({ path: "test-results/ux-active-speakers-people.png", fullPage: true, animations: "disabled" });
    await host.locator("body").click({ position: { x: 5, y: 5 } });
    await host.keyboard.press("f");
    await expect.poll(() => host.evaluate(() => document.fullscreenElement?.querySelectorAll(".active-speaker").length)).toBe(2);
    await host.screenshot({ path: "test-results/ux-fullscreen-speakers.png", animations: "disabled" });
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
    await expect(host.locator(".active-speaker").filter({ hasText: "Sam" })).toHaveCount(0);
    await expect(
      host.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
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
    await expect(host.getByRole("status")).toContainText("Reconnecting");
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
    await expect(host.getByRole("status")).toHaveText("Connected");
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
    route.fulfill({ json: { gifs: [item] } }),
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
  await expect(page.getByRole("button", { name: "Send Cat wave" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/ux-gif-grid-mobile.png", fullPage: true, animations: "disabled" });
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
  await page.getByRole("button", { name: "More message actions" }).click();
  await page.getByRole("button", { name: "Reactions", exact: true }).click();
  await page.getByRole("button", { name: "React fire" }).click();
  await expect(page.locator(".floating-reaction")).toHaveCount(1);
  await expect(page.locator(".floating-reaction")).toHaveCount(0, {
    timeout: 3000,
  });
  const clients = Array.from(
    { length: 3 },
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
      for (let n = 0; n < 5; n++) {
        await new Promise<void>((resolve) =>
          client.emit("reaction:send", { symbol: REACTIONS[5] }, () =>
            resolve(),
          ),
        );
        // Volatile room events deliberately drop bursts on a busy transport.
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    await expect(page.locator(".floating-reaction")).toHaveCount(12);
    await expect(page.locator(".floating-reaction")).toHaveCount(0, {
      timeout: 3000,
    });
    await page.getByRole("button", { name: "[fx]", exact: true }).click();
    await page.getByRole("button", { name: "More message actions" }).click();
    await page.getByRole("button", { name: "Reactions", exact: true }).click();
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

test("compact composer, emoji messages, source editing and normal/debug telemetry", async ({ page }) => {
  await serveClip(page.context());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await createRoom(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId("rtt")).toBeHidden();
  await page.screenshot({ path: "test-results/ux-idle-room.png", fullPage: true, animations: "disabled" });
  const input = page.getByLabel("Chat message");
  await input.focus();
  await input.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "<img src=x onerror=alert(1)>");
    data.setData("text/html", '<img src=x onerror=alert(1)>');
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(input).toHaveValue("<img src=x onerror=alert(1)>");
  await input.press("Enter");
  await expect(page.getByRole("log")).toContainText("<img src=x onerror=alert(1)>");
  await expect(page.getByRole("log").locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Emoji picker", exact: true }).click();
  await page.getByRole("button", { name: "Insert heart" }).click();
  await input.press("Enter");
  await expect(page.locator(".emoji-count-1")).toBeVisible();
  await expect(page.locator(".emoji-count-1")).toHaveCSS("font-size", "52px");
  await page.getByLabel("Video URL").fill("https://media.example/clip.webm");
  await page.getByRole("button", { name: "Load video" }).click();
  await expect(page.getByRole("button", { name: /Edit source/ })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Video URL")).toBeHidden();
  await page.getByRole("button", { name: /Edit source/ }).click();
  await expect(page.getByLabel("Video URL")).toBeVisible();
  await page.getByRole("button", { name: /SOURCE.*Close/ }).click();
  await page.screenshot({ path: "test-results/ux-loaded-chat.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/ux-mobile-chat.png", fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/?debug=1");
  await expect(page.getByTestId("rtt")).toBeVisible();
});

test("active speaker overlay caps presence and clears disconnected participants", async ({ page }) => {
  await createRoom(page);
  const code = page.url().split("/").pop()!;
  const clients: Socket<ServerEvents, ClientEvents>[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      const client = socketClient("http://127.0.0.1:3101", { forceNew: true }) as Socket<ServerEvents, ClientEvents>;
      clients.push(client);
      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => client.emit("room:join", { code, name: `Speaker ${i}` }, (result) => result.ok ? resolve() : reject(new Error(result.error))));
        client.on("connect_error", reject);
      });
      await new Promise<void>((resolve, reject) => client.emit("voice:state", { joined: true, muted: false, speaking: true }, (result) => result.ok ? resolve() : reject(new Error(result.error))));
    }
    await expect(page.locator(".active-speaker")).toHaveCount(3);
    await page.getByRole("tab", { name: /People/ }).click();
    await expect(page.getByLabel("Speaker 0: speaking")).toBeVisible();
    await page.getByRole("button", { name: "Fullscreen player", exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.querySelectorAll(".active-speaker").length)).toBe(3);
    for (const client of clients) client.disconnect();
    await expect(page.locator(".active-speaker")).toHaveCount(0);
  } finally { for (const client of clients) client.disconnect(); }
});

test("GIF picker distinguishes unavailable, empty, throttle and retry states", async ({ page }) => {
  let mode = "empty";
  await page.route("**/api/gifs/*", (route) => route.fulfill(mode === "empty" ? { json: { gifs: [] } } : mode === "missing" ? { status: 503, json: { error: "GIF search unavailable" } } : mode === "busy" ? { status: 429, json: { error: "busy" } } : { status: 502, json: { error: "provider failed" } }));
  await createRoom(page);
  const open = page.getByRole("button", { name: "Search GIFs", exact: true });
  await open.click();
  await expect(page.getByText("No GIFs found.")).toBeVisible();
  await page.keyboard.press("Escape"); mode = "busy";
  await open.click();
  await expect(page.getByRole("status").filter({ hasText: "busy" })).toBeVisible();
  mode = "empty";
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("No GIFs found.")).toBeVisible();
  await page.screenshot({ path: "test-results/ux-gif-empty.png", fullPage: true, animations: "disabled" });
  await page.keyboard.press("Escape"); mode = "missing";
  await open.click();
  await expect(page.getByText("GIF search unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search GIFs" })).toBeHidden();
  await page.keyboard.press("Escape"); mode = "failure";
  await open.click();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
});

test("obsolete GIF searches cannot replace the latest results", async ({ page }) => {
  const result = (title: string) => ({ gifs: [{ id: title, title, previewUrl: "https://media.giphy.com/media/cat/100.webp", originalUrl: "https://media.giphy.com/media/cat/giphy.gif", width: 320, height: 240 }] });
  await page.route("https://media.giphy.com/**", (route) => route.fulfill({ contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }));
  await page.route("**/api/gifs/*", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "trending";
    if (q === "old") await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ json: result(q) }).catch(() => {});
  });
  await createRoom(page);
  await page.getByRole("button", { name: "Search GIFs", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Search GIFs" });
  const obsolete = page.waitForRequest((request) => request.url().includes("q=old"));
  await input.fill("old");
  await obsolete;
  const aborted = page.waitForEvent("requestfailed", (request) => request.url().includes("q=old"));
  await input.fill("latest");
  await aborted;
  await expect(page.getByRole("button", { name: "Send latest" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send old", exact: true })).toHaveCount(0);
});

test("a pointer scrub emits only once on release, including release outside the rail", async ({ page }) => {
  await serveClip(page.context());
  let seeks = 0;
  page.on("websocket", (connection) => connection.on("framesent", (frame) => {
    if (String(frame.payload).includes('"action":"seek"')) seeks++;
  }));
  await createRoom(page);
  await page.getByLabel("Video URL").fill("https://media.example/clip.webm");
  await page.getByRole("button", { name: "Load video" }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  const slider = page.getByLabel("Seek video");
  const rect = (await slider.boundingBox())!;
  await page.mouse.move(rect.x + 5, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .7, rect.y + rect.height / 2, { steps: 15 });
  expect(seeks).toBe(0);
  await page.mouse.move(rect.x + rect.width + 20, rect.y + 50);
  await page.mouse.up();
  await expect.poll(() => seeks).toBe(1);
});
