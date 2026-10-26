(() => {
  try {
    const key = "flickfolk-accent";
    let accent = globalThis.localStorage.getItem(key);
    if (!/^#[0-9a-f]{6}$/i.test(accent || "") || accent.toLowerCase() === "#7cc6a4")
      accent = "#f2b05e";
    globalThis.document.documentElement.style.setProperty("--accent", accent);
    globalThis.document.documentElement.dataset.accent = accent.slice(1);
    globalThis.document.querySelector('meta[name="theme-color"]')?.setAttribute("content", accent);
  } catch {
    /* Storage or DOM access is optional during prepaint. */
  }
})();
