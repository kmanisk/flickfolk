import { expect, test, type Browser, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const matching = fileURLToPath(
  new URL("./fixtures/local-sync.webm", import.meta.url),
);
const mismatch = fileURLToPath(
  new URL("./fixtures/local-mismatch.webm", import.meta.url),
);
const mkv = fileURLToPath(new URL("./fixtures/local-sync.mkv", import.meta.url));

async function room(
  browser: Browser,
  source = matching,
  sourceName = "local-sync.webm",
) {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const host = await first.newPage();
  const guest = await second.newPage();
  const errors: string[] = [];
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
  await host.getByRole("tab", { name: "Local file", exact: true }).click();
  await host
    .locator(".local-source-picker input[type=file]")
    .setInputFiles(source);
  await expect(guest.getByText(`Host is playing ${sourceName}`)).toBeVisible();

  return {
    host,
    guest,
    errors,
    close: async () => {
      await first.close();
      await second.close();
    },
  };
}

async function enablePlayback(page: Page) {
  const button = page.getByRole("button", { name: "Click to enable playback" });
  if (await button.isVisible()) await button.click();
}

test("matching local copies use the existing synchronized playback engine", async ({
  browser,
}) => {
  const { host, guest, errors, close } = await room(browser);
  try {
    await guest
      .locator(".local-file-panel input[type=file]")
      .setInputFiles(matching);
    await expect(guest.locator("video")).toBeVisible();
    await expect(
      host.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();

    await host.getByRole("button", { name: "Play", exact: true }).click();
    await enablePlayback(guest);
    await expect
      .poll(async () => {
        const hostTime = await host
          .locator("video")
          .evaluate((video) => (video as HTMLVideoElement).currentTime);
        const guestTime = await guest
          .locator("video")
          .evaluate((video) => (video as HTMLVideoElement).currentTime);
        return Math.abs(hostTime - guestTime);
      })
      .toBeLessThan(0.6);

    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

test("a different local file is rejected before playback", async ({ browser }) => {
  const { guest, errors, close } = await room(browser);
  try {
    await guest
      .locator(".local-file-panel input[type=file]")
      .setInputFiles(mismatch);
    await expect(
      guest.getByText("That looks like a different file."),
    ).toBeVisible();
    await expect(guest.locator(".local-file-panel")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});


test("local MKV plays when its codecs are supported by Chromium", async ({ browser }) => {
  const { host, guest, errors, close } = await room(
    browser,
    mkv,
    "local-sync.mkv",
  );
  try {
    await guest
      .locator(".local-file-panel input[type=file]")
      .setInputFiles(mkv);
    await expect(host.locator("video")).toBeVisible();
    await expect(guest.locator("video")).toBeVisible();
    await expect(
      host.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await host.getByRole("button", { name: "Play", exact: true }).click();
    await enablePlayback(guest);
    await expect
      .poll(() =>
        host
          .locator("video")
          .evaluate((video) => (video as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.15);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});
