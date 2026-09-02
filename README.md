# Grove Church Midland

Single-page site. No build step — `index.html` plus `assets/`.

## Running it

Open `index.html` directly, or serve it:

    python3 -m http.server 8140 --directory .

## Notes

- **Intro** plays on every load (no once-per-session gate) and is skippable
  by click, scroll, or Esc/Enter/Space.
- **Smooth scroll** is [Lenis](https://github.com/darkroomengineering/lenis),
  vendored at `assets/vendor/lenis.min.js`. `scroll-behavior: smooth` must stay
  off — it fights Lenis.
- **`chapel-bw.jpg`** has its greyscale/contrast baked in. Don't reintroduce a
  CSS `filter` on it; re-filtering a full-bleed image every frame while it is
  being parallaxed is expensive.
- **`logo-white.png`** is the logo keyed to real alpha. `logo-src.jpg` is the
  original, kept only as the favicon.
- Content mirrors https://www.grovechurchmidland.com
