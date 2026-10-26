(() => {
  try {
    const key = "flickfolk-accent";
    let accent = localStorage.getItem(key);
    if (!/^#[0-9a-f]{6}$/i.test(accent || "") || accent.toLowerCase() === "#7cc6a4")
      accent = "#f2b05e";
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.dataset.accent = accent.slice(1);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", accent);
  } catch {}
})();
