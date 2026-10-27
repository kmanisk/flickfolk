import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createApp } from "../apps/server/src/server.js";
import { readFileSync } from "node:fs";
async function room(page: Page) {
  const app = createApp();
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  const address = app.http.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const origin = `http://127.0.0.1:${address.port}`;
  await page.goto(origin);
  await page.getByLabel("What should we call you?").fill("Alex");
  await page.getByRole("button", { name: "Start a room" }).click();
  await expect(page.getByRole("heading", { name: /Room / })).toBeVisible();
  return { app, origin };
}
async function load(page: Page, url: string) {
  await page.getByRole("button", { name: "Change video source" }).click();
  await page.getByLabel("Video URL").fill(url);
  await page.getByRole("button", { name: "Load video" }).click();
}
const sdk = `
window.__sdk = { position: 0, duration: 120, playing: false, volume: .7, index: 0, calls: [], parent: [], ignorePlay:false };
const sample=window.__sdk;
let began=performance.now();
function pos(){return sample.position+(sample.playing?(performance.now()-began)/1000:0);}
function pause(){sample.position=pos();sample.playing=false;}
function play(){if(!sample.playing){began=performance.now();sample.playing=true;}}
const callbacks=new Map();
function add(event,fn){const list=callbacks.get(event)||new Set();list.add(fn);callbacks.set(event,list);}
function remove(event,fn){callbacks.get(event)?.delete(fn);}
function emit(event,data){callbacks.get(event)?.forEach(fn=>fn(data));}
window.Twitch={Player: class {
  static READY='ready'; static PLAY='play'; static PLAYING='playing'; static PAUSE='pause';static SEEK='seek';static ENDED='ended';static OFFLINE='offline';static PLAYBACK_BLOCKED='blocked';
  constructor(id,options){const el=document.getElementById(id);sample.parent=options.parent;const frame=document.createElement('iframe');frame.title='Twitch player';frame.src='https://player.twitch.tv/test-frame';el.replaceChildren(frame);setTimeout(()=>emit('ready'),30);}
  play(){sample.calls.push('play');play();emit('playing');}
  pause(){sample.calls.push('pause');pause();emit('pause');}
  seek(t){sample.calls.push('seek');sample.position=t;began=performance.now();emit('seek');}
  getCurrentTime(){return pos();} getDuration(){return sample.duration;} isPaused(){return !sample.playing;}
  getVolume(){return sample.volume;} setVolume(v){sample.volume=v;} setMuted(v){sample.muted=v;}
  addEventListener(e,fn){add(e,fn);} removeEventListener(e,fn){remove(e,fn);}
}};
window.SC={Widget: Object.assign(function(frame){
 const progress=()=>emit('progress',{currentPosition:(pos()-sample.index*60)*1000});let timer;
 return {
  bind(e,fn){add(e,fn);if(e==='ready')setTimeout(fn,30);},unbind(e){callbacks.delete(e);if(e==='progress')clearInterval(timer);},
  getSounds(fn){fn([{duration:60000},{duration:60000}]);},getCurrentSoundIndex(fn){fn(sample.index);},getDuration(fn){fn(60000);},getPosition(fn){fn((pos()-sample.index*60)*1000);},getVolume(fn){fn(sample.volume*100);},setVolume(v){sample.volume=v/100;},
  play(){sample.calls.push('play');play();emit('play');progress();clearInterval(timer);timer=setInterval(progress,150);},pause(){pause();clearInterval(timer);emit('pause');},
  seekTo(ms){sample.calls.push('seek');sample.position=sample.index*60+ms/1000;began=performance.now();emit('seek',{currentPosition:ms});},
  skip(i){sample.index=i;sample.position=i*60;began=performance.now();emit('play');}
 };
},{Events:{READY:'ready',PLAY:'play',PAUSE:'pause',PLAY_PROGRESS:'progress',SEEK:'seek',FINISH:'finish',ERROR:'error'}})};
const spotifyAPI={createController(el,options,ready){
 const f=document.createElement('iframe');f.title='Spotify player';f.src='https://open.spotify.com/test-frame';el.replaceWith(f);
 const update=()=>emit('playback_update',{data:{position:pos()*1000,duration:sample.duration*1000,isPaused:!sample.playing,isBuffering:false}});let timer;
 ready({
  addListener(e,fn){add(e,fn);if(e==='ready')setTimeout(()=>{fn();update();},30);},removeListener(e,fn){remove(e,fn);},
  play(){sample.calls.push('play');if(sample.ignorePlay)return;play();update();clearInterval(timer);timer=setInterval(update,150);},pause(){pause();clearInterval(timer);update();},
  seek(t){sample.calls.push('seek');sample.position=t;began=performance.now();update();},destroy(){clearInterval(timer);f.remove();}
 });
}};
if(window.onSpotifyIframeApiReady)window.onSpotifyIframeApiReady(spotifyAPI);
`;
async function providers(context: BrowserContext) {
  for (const url of [
    "https://player.twitch.tv/js/embed/v1.js",
    "https://w.soundcloud.com/player/api.js",
    "https://open.spotify.com/embed/iframe-api/v1",
  ])
    await context.route(url, (route) =>
      route.fulfill({ contentType: "application/javascript", body: sdk }),
    );
  for (const url of [
    "https://player.twitch.tv/test-frame",
    "https://open.spotify.com/test-frame",
    "https://w.soundcloud.com/player/**",
    "https://player.kick.com/**",
  ])
    await context.route(url, (route) => {
      if (route.request().resourceType() === "script") return route.fallback();
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Provider test frame</title>",
      });
    });
}
async function values(page: Page) {
  const target =
    page
      .frames()
      .find((frame) => frame.url().includes("/spotify-bridge.html")) ?? page;
  return target.evaluate(() => {
    const state = (
      window as unknown as {
        __sdk: {
          position: number;
          playing: boolean;
          calls: string[];
          parent: string[];
          index: number;
        };
      }
    ).__sdk;
    return state;
  });
}
test("Home has one header GitHub link, no footer, no auth, no effects; local identity still creates rooms", async ({
  page,
}) => {
  const { app } = await room(page);
  try {
    await page.getByRole("button", { name: "Leave room" }).click();
    const github = page.getByRole("link", { name: "GitHub", exact: true });
    await expect(github).toHaveCount(1);
    await expect(github).toHaveAttribute(
      "href",
      "https://github.com/kmanisk/flickfolk",
    );
    await expect(github).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("contentinfo")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /Effects|Sign in|Continue anonymously/i,
      }),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel("What should we call you?")).toHaveValue(
      "Alex",
    );
    await page.getByRole("button", { name: "Start a room" }).click();
    await expect(page.getByRole("heading", { name: /Room / })).toBeVisible();
  } finally {
    await page.close();
    await app.shutdown();
  }
});
test("direct audio uses the authoritative player and Effects unlocks only after actual playback", async ({
  page,
}) => {
  await providers(page.context());
  const audio = readFileSync(new URL("./fixtures/audio.ogg", import.meta.url));
  await page.route("https://media.example/audio.ogg", (route) =>
    route.fulfill({ contentType: "audio/ogg", body: audio }),
  );
  const { app } = await room(page);
  try {
    await page.getByRole("button", { name: "Audio settings" }).click();
    await expect(
      page.getByRole("button", { name: "Effects on", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await load(page, "https://media.example/audio.ogg");
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Audio settings" }).click();
    await expect(
      page.getByRole("button", { name: "Effects on", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator("video")
          .evaluate((v) => (v as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.2);
    await page.getByRole("button", { name: "Audio settings" }).click();
    await expect(
      page.getByRole("button", { name: "Effects on", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await load(page, "https://kick.com/streamer");
    await page.getByRole("button", { name: "Audio settings" }).click();
    await expect(
      page.getByRole("button", { name: "Effects on", exact: true }),
    ).toHaveCount(0);
  } finally {
    await page.close();
    await app.shutdown();
  }
});


test("extensionless signed video URLs use the native synchronized player", async ({
  page,
}) => {
  const clip = readFileSync(new URL("./fixtures/clip.webm", import.meta.url));
  await page.route("https://media.example/signed/playback?token=test", (route) =>
    route.fulfill({
      contentType: "video/webm",
      body: clip,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  const { app } = await room(page);
  try {
    await load(page, "https://media.example/signed/playback?token=test");
    await expect(page.locator("video")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator("video")
          .evaluate((video) => (video as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.15);
  } finally {
    await page.close();
    await app.shutdown();
  }
});

test("Twitch VOD uses official SDK, deployed parent, sync commands and late join", async ({
  page,
  browser,
}) => {
  await providers(page.context());
  const guestContext = await browser.newContext();
  await providers(guestContext);
  const { app } = await room(page);
  try {
    await load(page, "https://twitch.tv/videos/1234567");
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    expect((await values(page)).parent).toEqual(["127.0.0.1"]);
    await expect(page.locator(".external-mount iframe")).toHaveAttribute(
      "allow",
      /keyboard-map/,
    );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(async () => (await values(page)).playing).toBe(true);
    await page.keyboard.press("l");
    await expect
      .poll(async () => (await values(page)).position)
      .toBeGreaterThanOrEqual(10);
    const guest = await guestContext.newPage();
    await guest.goto(page.url());
    await guest.getByLabel("What should we call you?").fill("Sam");
    await guest.getByRole("button", { name: /^Join/ }).click();
    await expect(
      guest.getByRole("button", { name: "Pause", exact: true }),
    ).toBeDisabled();
    await expect(guest.locator(".external-mount iframe")).toBeVisible();
    await expect
      .poll(async () => (await values(guest)).position)
      .toBeGreaterThanOrEqual(10);
    await page.keyboard.press("k");
    await expect.poll(async () => (await values(guest)).playing).toBe(false);
    await page.keyboard.press("f");
    await expect(
      page.getByRole("button", { name: "Exit fullscreen" }),
    ).toBeVisible();
  } finally {
    await page.close();
    await guestContext.close();
    await app.shutdown();
  }
});
test("live Twitch and Kick hide timeline controls and never emit a seek", async ({
  page,
}) => {
  await providers(page.context());
  const { app } = await room(page);
  let seeks = 0;
  page.on("websocket", (ws) =>
    ws.on("framesent", (e) => {
      if (String(e.payload).includes('"action":"seek"')) seeks++;
    }),
  );
  try {
    for (const url of [
      "https://twitch.tv/twitchdev",
      "https://player.kick.com/streamer",
    ]) {
      await load(page, url);
      await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Seek video")).toHaveCount(0);
      await expect(page.locator(".player-controls .time")).toHaveCount(0);
      await expect(page.getByTestId("drift")).toHaveText("--");
      await page
        .getByLabel("Watch reactions")
        .getByRole("button", { name: "React fire" })
        .click();
      await page.keyboard.press("j");
      await page.keyboard.press("l");
      expect(seeks).toBe(0);
      if (url.includes("kick")) {
        await expect(
          page.getByRole("button", { name: "Play", exact: true }),
        ).toHaveCount(0);
        await expect(page.getByLabel("Movie volume")).toHaveCount(0);
      }
    }
  } finally {
    await page.close();
    await app.shutdown();
  }
});
test("SoundCloud playlist seeking selects the correct sound and preserves attribution", async ({
  page,
}) => {
  await providers(page.context());
  const { app } = await room(page);
  try {
    await load(page, "https://soundcloud.com/artist/sets/list");
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await expect(
      page.locator('iframe[title="SoundCloud player"]'),
    ).toHaveAttribute("src", /show_user=true/);
    const slider = page.getByLabel("Seek video");
    await expect(slider).toHaveAttribute("max", "120");
    await slider.focus();
    await slider.evaluate((el) => {
      const input = el as HTMLInputElement;
      input.value = "95";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await slider.press("ArrowRight");
    await expect.poll(async () => (await values(page)).index).toBe(1);
    await expect
      .poll(async () => (await values(page)).position)
      .toBeGreaterThanOrEqual(95);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(async () => (await values(page)).playing).toBe(true);
  } finally {
    await page.close();
    await app.shutdown();
  }
});
test("Spotify music is capability-limited and blocked playback offers an explicit gesture", async ({
  page,
}) => {
  await providers(page.context());
  const { app } = await room(page);
  try {
    await load(page, "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel("Seek video")).toHaveCount(0);
    await expect(page.getByLabel("Movie volume")).toHaveCount(0);
    await expect(page.locator(".player-controls .time")).toHaveCount(0);
    await (
      page
        .frames()
        .find((frame) => frame.url().includes("/spotify-bridge.html")) ?? page
    ).evaluate(() => {
      (
        window as unknown as { __sdk: { ignorePlay: boolean } }
      ).__sdk.ignorePlay = true;
    });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Click to enable playback" }),
    ).toBeVisible({ timeout: 7000 });
    await expect(page.getByTestId("drift")).toHaveText("--");
    await (
      page
        .frames()
        .find((frame) => frame.url().includes("/spotify-bridge.html")) ?? page
    ).evaluate(() => {
      (
        window as unknown as { __sdk: { ignorePlay: boolean } }
      ).__sdk.ignorePlay = false;
    });
    await page
      .getByRole("button", { name: "Click to enable playback" })
      .click();
    await expect.poll(async () => (await values(page)).playing).toBe(true);
    await expect(
      page.getByRole("status", { name: "Connection" }),
    ).toContainText("limited");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bridge = page
      .frames()
      .find((frame) => frame.url().includes("/spotify-bridge.html"))!;
    const native = await bridge.locator("iframe").boundingBox();
    expect(native!.height).toBeGreaterThanOrEqual(352);
    await expect(
      page.getByRole("button", { name: "Send message" }),
    ).toBeInViewport();
  } finally {
    await page.close();
    await app.shutdown();
  }
});

test("Spotify episodes expose seeking and SDK errors leave room chat usable", async ({
  page,
}) => {
  await providers(page.context());
  const { app } = await room(page);
  try {
    await load(page, "https://open.spotify.com/episode/4cOdK2wGLETKBW3PvgPWqT");
    await expect(page.getByLabel("Seek video")).toBeEnabled();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.keyboard.press("l");
    await expect
      .poll(async () => (await values(page)).position)
      .toBeGreaterThanOrEqual(10);
    await page.route("https://w.soundcloud.com/player/api.js", (route) =>
      route.abort("failed"),
    );
    await load(page, "https://soundcloud.com/artist/a-track");
    await expect(page.getByRole("alert")).toContainText(
      "provider could not load",
    );
    await page.getByLabel("Chat message").fill("Still here");
    await page.getByLabel("Chat message").press("Enter");
    await expect(page.getByRole("log")).toContainText("Still here");
  } finally {
    await page.close();
    await app.shutdown();
  }
});

test("provider CSP permits exact official script/frame hosts without opening all scripts", async ({
  request,
}) => {
  const response = await request.get("/");
  const csp = response.headers()["content-security-policy"]!;
  const script = csp.split(";").find((s) => s.trim().startsWith("script-src"))!;
  expect(script).not.toContain("https://embed-cdn.spotifycdn.com");
  const bridge = await request.get("/spotify-bridge.html");
  expect(bridge.status()).toBe(200);
  const bridgePolicy = bridge.headers()["content-security-policy"]!;
  expect(bridgePolicy).toContain("'unsafe-eval'");
  expect(bridgePolicy).toContain("https://embed-cdn.spotifycdn.com");
  expect(bridgePolicy).toContain("frame-ancestors 'self'");
  expect(script).toContain("https://player.twitch.tv");
  expect(script).toContain("https://w.soundcloud.com");
  expect(script).not.toContain("'unsafe-inline'");
  expect(script).not.toContain("'unsafe-eval'");
  expect(script.split(" ")).not.toContain("https:");
  for (const host of [
    "player.twitch.tv",
    "w.soundcloud.com",
    "open.spotify.com",
    "player.kick.com",
  ])
    expect(csp).toContain(`https://${host}`);
});
