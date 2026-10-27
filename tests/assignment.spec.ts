import { test, expect, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const clip = readFileSync(new URL("./fixtures/clip.webm", import.meta.url));

async function pair(browser: Browser) {
  const first = await browser.newContext(),
    second = await browser.newContext();
  for (const context of [first, second])
    await context.route("https://media.example/clip.webm", (route) => {
      const range = /bytes=(\d+)-(\d*)/.exec(
        route.request().headers().range ?? "",
      );
      const start = range ? Number(range[1]) : 0,
        end = range?.[2] ? Number(range[2]) : clip.length - 1;
      return route.fulfill({
        status: range ? 206 : 200,
        body: clip.subarray(start, end + 1),
        contentType: "video/webm",
        headers: {
          "accept-ranges": "bytes",
          "access-control-allow-origin": "*",
          ...(range
            ? { "content-range": `bytes ${start}-${end}/${clip.length}` }
            : {}),
        },
      });
    });
  const host = await first.newPage(),
    guest = await second.newPage();
  const errors: string[] = [];
  const guestTraffic = { controls: 0, requests: 0 };
  guest.on("websocket", (ws) =>
    ws.on("framesent", ({ payload }) => {
      const packet = String(payload);
      if (packet.includes("playback:control")) guestTraffic.controls++;
      if (packet.includes("control:request")) guestTraffic.requests++;
    }),
  );
  for (const page of [host, guest])
    page.on("pageerror", (error) => errors.push(error.message));
  await host.goto("/");
  await host.getByLabel("What should we call you?").fill("Alex");
  await host.getByRole("button", { name: "Start a room" }).click();
  await expect(host).toHaveURL(/\/room\//);
  await guest.goto(host.url());
  await guest.getByLabel("What should we call you?").fill("Sam");
  await guest.getByRole("button", { name: "Join", exact: true }).click();
  await expect(guest.getByRole("heading", { name: /Room / })).toBeVisible();
  await host.getByRole("button", { name: "Change video source" }).click();
  await host.getByLabel("Video URL").fill("https://media.example/clip.webm");
  await host.getByRole("button", { name: "Load video" }).click();
  await expect(
    host.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  return {
    host,
    guest,
    errors,
    guestTraffic,
    close: async () => {
      await first.close();
      await second.close();
    },
  };
}
async function manage(host: Page) {
  await host.getByRole("tab", { name: /People/ }).click();
  await host.getByRole("button", { name: "Manage Sam", exact: true }).click();
}
async function enablePlayback(page: Page) {
  const button = page.getByRole("button", { name: "Click to enable playback" });
  if (await button.isVisible()) await button.click();
}

test("participant requests pause; host reviews, approves and denies without bypassing authority", async ({
  browser,
}) => {
  const { host, guest, errors, close, guestTraffic } = await pair(browser);
  try {
    await expect(
      guest.getByRole("button", { name: "Play", exact: true }),
    ).toBeDisabled();
    await host.getByRole("button", { name: "Play", exact: true }).click();
    await enablePlayback(guest);
    await expect
      .poll(() =>
        guest
          .locator("video")
          .evaluate((el) => (el as HTMLVideoElement).paused),
      )
      .toBe(false);
    await guest.keyboard.press("k");
    await expect(guest.getByRole("alert")).toContainText(
      "Only the host and moderators",
    );
    await guest
      .getByRole("button", { name: "Request playback control", exact: true })
      .click();
    await guest
      .getByRole("button", { name: "Request pause", exact: true })
      .click();
    await expect(guest.getByRole("alert")).toContainText(
      "Waiting for approval",
    );
    await host
      .getByRole("button", { name: "Requests (1)", exact: true })
      .click();
    await host.getByRole("button", { name: "Approve Sam's request" }).click();
    for (const page of [host, guest])
      await expect
        .poll(() =>
          page
            .locator("video")
            .evaluate((el) => (el as HTMLVideoElement).paused),
        )
        .toBe(true);
    await expect(guest.getByRole("alert")).toContainText("Approved");
    await guest
      .getByRole("button", { name: "Request play", exact: true })
      .click();
    await host.getByRole("button", { name: "Deny Sam's request" }).click();
    await expect(guest.getByRole("alert")).toContainText("Declined");
    expect(guestTraffic.controls).toBe(0);
    expect(guestTraffic.requests).toBe(2);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

test("host promotes/demotes; moderator controls playback and source, then wins host failover", async ({
  browser,
}) => {
  const { host, guest, errors, close } = await pair(browser);
  try {
    await manage(host);
    await host.getByRole("button", { name: "Make moderator" }).click();
    await guest.getByRole("tab", { name: /People/ }).click();
    await expect(guest.getByText("MODERATOR", { exact: true })).toBeVisible();
    await guest.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      host.getByRole("button", { name: "Pause", exact: true }),
    ).toBeEnabled();
    await guest.getByRole("button", { name: "Pause", exact: true }).click();
    await guest.getByLabel("Seek video").focus();
    await guest.getByLabel("Seek video").press("ArrowRight");
    await expect
      .poll(() =>
        host
          .locator("video")
          .evaluate((el) => (el as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0);
    await expect(guest.getByRole("button", { name: /^Manage / })).toHaveCount(
      0,
    );
    await guest.getByRole("button", { name: "Change video source" }).click();
    await expect(
      guest.getByRole("button", { name: "Load video" }),
    ).toBeVisible();
    await guest.keyboard.press("Escape");
    await host.getByRole("button", { name: "Manage Sam", exact: true }).click();
    await host.getByRole("button", { name: "Make participant" }).click();
    await expect(
      guest.getByRole("button", { name: "Play", exact: true }),
    ).toBeDisabled();
    await host.getByRole("button", { name: "Manage Sam", exact: true }).click();
    await host.getByRole("button", { name: "Make moderator" }).click();
    await host.getByRole("button", { name: "Leave room", exact: true }).click();
    await expect(guest.getByText("HOST", { exact: true })).toBeVisible();
    await expect(guest.getByRole("alert")).toContainText(
      "You are now the host",
    );
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

test("removal is confirmed, survives refresh and Back home allows an intentional new join", async ({
  browser,
}) => {
  const { host, guest, errors, close } = await pair(browser);
  try {
    const invite = host.url();
    await manage(host);
    await host
      .getByRole("button", { name: "Remove from room", exact: true })
      .click();
    await expect(
      host.getByRole("dialog", { name: "Remove Sam?" }),
    ).toBeVisible();
    await host
      .getByRole("button", { name: "Remove from room", exact: true })
      .click();
    await expect(
      guest.getByRole("heading", {
        name: "You were removed from this room by the host.",
      }),
    ).toBeVisible();
    await guest.reload();
    await expect(
      guest.getByRole("heading", {
        name: "You were removed from this room by the host.",
      }),
    ).toBeVisible();
    await expect(host.getByText("Sam", { exact: true })).toHaveCount(0);
    await guest.getByRole("button", { name: "Back home", exact: true }).click();
    await guest.getByLabel("Room code or invite link").fill(invite);
    await guest.getByRole("button", { name: "Join", exact: true }).click();
    await expect(guest.getByRole("heading", { name: /Room / })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

test("participant seek and source requests are explicit, including at phone widths", async ({
  browser,
}) => {
  const { host, guest, close } = await pair(browser);
  try {
    await guest.setViewportSize({ width: 390, height: 844 });
    await guest.getByLabel("Request seek", { exact: true }).focus();
    await guest.getByLabel("Request seek", { exact: true }).press("ArrowRight");
    await host
      .getByRole("button", { name: "Requests (1)", exact: true })
      .click();
    await expect(
      host.getByRole("dialog", { name: "Control requests" }),
    ).toContainText("Seek to");
    await host.getByRole("button", { name: "Approve Sam's request" }).click();
    await guest.getByRole("button", { name: "Request video source" }).click();
    await guest.getByLabel("Video URL").fill("https://media.example/clip.webm");
    await guest
      .getByRole("button", { name: "Request source", exact: true })
      .click();
    await expect(
      host.getByRole("dialog", { name: "Control requests" }),
    ).toContainText("Change source");
    await host.getByRole("button", { name: "Approve Sam's request" }).click();
    await expect(guest.getByRole("alert")).toContainText("Approved");
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await close();
  }
});

test("kinetic Home stays stable and accessible across responsive sizes and reduced motion", async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 740],
    [360, 800],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "Same movie. Same second.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start a room" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  const form = page.getByRole("region", { name: "Create or join a room" });
  await form.evaluate(async (element) => {
    await document.fonts.ready;
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
  const before = await form.boundingBox();
  await expect(page.locator('.phrase[data-active="true"]')).not.toHaveText(
    "Same second.",
    { timeout: 5500 },
  );
  expect((await form.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator('.phrase[data-active="true"]')).toHaveText(
    "Same second.",
  );
  expect(
    await page
      .locator(".kinetic-headline")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
