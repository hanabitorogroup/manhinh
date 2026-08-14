---
name: ui-ux-pro-max
description: Reviews UI/UX, visual design, layout, typography, color, contrast, motion, and readability for the Hanabi & Toro digital menu — the 4 customer-facing 4K signage screens (public/omh1..4.html) and the Vietnamese admin panel (public/admin/). Use this whenever a change touches display.css, themes.js, effects.js, admin.css, admin.js, or any omhN.html, or whenever the user asks to review, critique, or sanity-check how the menu screens or admin panel look — new theme, color change, font/size change, animation/transition change, layout change, contrast complaint, "does this look right", or a request to check 4K/legibility/distance readability. This project has hardware and viewing-distance constraints that generic design advice gets wrong, so prefer this skill over general UI critique for any visual change in this repo.
---

# UI/UX review for Hanabi & Toro digital menu

This is not a normal responsive website. Read this before eyeballing any screenshot.

## The two audiences this system serves

1. **`public/omh1.html`–`omh4.html`** — four IIYAMA 49.5" 4K panels (LH5060UHS-B1AG),
   3840×2160, bolted to a wall, viewed from **3–5 metres**, running **24/7** on a weak
   Android SoC through `iiSignage`. Content is **Polish**. Nobody touches these screens
   or sits close to them — legibility from across a room and 24/7 stability beat
   desktop-web polish every time.
2. **`public/admin/`** — a phone-and-desktop tool the restaurant owner uses in
   **Vietnamese**, up close, to edit prices and toggle dishes. Normal web-app UX rules
   apply here: this is where "looks cramped on my phone" is a real bug.

Never critique screen 1 by desktop-web instincts, and never excuse the admin panel by
signage instincts — check each against the audience that actually uses it. Full hardware
detail is in `docs/ARCHITECTURE.md` §9 — read it if you need the "why", not just the
"what" below.

## Five constraints that are load-bearing, not style choices

A reviewer's job is as much to stop a well-intentioned "fix" as to catch a real bug.
Each of these has already broken production once or was designed around a real failure
mode — don't re-break them.

### 1. Sizing must be resolution-independent — no px caps, ever

The panels' WebView may or may not honor `<meta name="viewport" content="width=1920">`.
When it does, layout renders at 1920 CSS px; when it doesn't, at 3840 CSS px. The fix
already in place (`public/assets/css/display.css`, the `html { font-size: clamp(...) }`
rule at the top) makes the root font size track `100vw` — 16px at a 1920-wide viewport,
32px at 3840. Every size in the file rides on that by being written in `rem` inside
`clamp()`. **A `clamp()` with a hardcoded `px` max is a bug**: it will look right in a
1920 screenshot and visibly shrink (~40%) in a 3840 one, because the `px` ceiling gets
hit at the higher viewport while the `vw`-scaled root font moves past it. Grep for bare
`px` inside any `clamp(...)` in `display.css` before approving a sizing change — the file
header itself documents which few decorative exceptions are intentionally px-pinned.

### 2. Color must come from theme custom properties, never hardcoded

`themes.js` defines 6 seasonal themes (`THEMES` in `public/assets/js/themes.js`) and
writes them onto `#app` as CSS custom properties via `applyTheme()`: `--bg`,
`--bg-gradient`, `--text`, `--outline`, `--outline-w-base` (→ derived `--outline-w`),
`--accent`, `--price`, `--card-bg`, `--font-heading`, `--font-body`, `--overlay-image`.
`display.css` consumes only these variables for anything theme-relevant. A literal
`color: #fff` or `background: #222` dropped into a rule that isn't one of the two
intentionally-neutral exceptions (the `#000` letterbox background and the black
`card-body` scrim gradient, both called out in the CSS comments as *not* part of the
seasonal identity) is a defect: it will look fine in whatever theme was open at the time
and be wrong in the other five. When you review a color-related change, open the diff
against all 6 themes mentally (or literally, via the admin's "Giao diện" tab, which
applies instantly to a live preview) — not just the one theme that happened to be active.

### 3. The particle canvas is deliberately capped — don't "optimize" it upward

`public/assets/js/effects.js` caps the particle canvas backing buffer to
`MAX_BACKING_W/H = 1920×1080` and the frame rate to `TARGET_FPS = 30`, regardless of the
panel's real 4K resolution or reported DPR — CSS still stretches the canvas to fill the
screen. This is intentional: the panels run a weak SoC 24/7, and soft/blurry particles
(snow, petals, embers) don't visibly benefit from a native 4K backing buffer, but drawing
one every frame forever would overheat and stutter the device. **If a screenshot shows
particles looking slightly soft at close zoom, that is correct, not a bug.** Also don't
suggest raising `CAPS.full` (particle count) or `TARGET_FPS` without a stated performance
budget — this file already scales particle count down further on wide viewports
(`LARGE_VIEWPORT_CAP_SCALE`) for the same SoC-load reason.

### 4. Motion: fade / slide / parallax / Ken Burns yes; rotation and flashing no

Card entrances, page transitions (`display.css`, the `.t-fade` / `.t-slide` / `.t-flip` /
`.t-curtain` rules), the Ken Burns image zoom (`@keyframes kenBurns`), and the burn-in
drift (`@keyframes burnInDrift`) must animate only `transform` and `opacity` — that's
what keeps it GPU-cheap on the panel and jitter-free at 24/7. Flag any new animation that
touches `width`, `height`, `top`, `left`, or other layout-triggering properties. Separately,
the owner does not want **spinning/rotating motion or flashing** as a menu effect —
treat any animated `rotate()`/`rotateZ()` beyond a few degrees, or any rapid
opacity-flicker, as a finding to raise even if it's cheap on the GPU. This is a taste
rule, not a performance rule, so don't wave it through just because it passes the
transform/opacity test. Note the existing `.t-flip` transition already does a subtle
6° `rotateY` tilt as a page-turn cue — that one's shipped and accepted, but don't use it
as precedent to add more rotation; ask before extending it. A *static* rotated element
(the corner ribbon badge, `transform: rotate(38deg)` with no animation) is fine — it's
not motion.

### 5. Polish diacritics and price formatting must survive typography changes

Screen content is Polish (ą ć ę ł ń ó ś ź ż, e.g. real seed data like "Zupa miso z
tofu" or "Łosoś teriyaki"), and price rendering goes through `formatPrice()` in
`display.js`, which uses `Number.toLocaleString("pl-PL", ...)` — **comma** as the decimal
separator (`39,90`, not `39.90`) — followed by the currency (default `zł`) and an
optional suffix like `/100g`. Any font swap, `text-transform`, letter-spacing change, or
`-webkit-line-clamp` truncation must be checked against actual diacritic glyphs (not just
ASCII placeholder text) and against a full price string, including the currency and
suffix — truncation or clamping that quietly drops the `zł` or the suffix is a real bug,
not a cosmetic nit.

## Review procedure

Don't eyeball a single 1080p screenshot and call it done. At minimum:

1. **Screenshot at both target viewports**, since the meta-viewport bet can go either
   way on real hardware: 1920×1080 CSS px, and 3840×2160 CSS px (Chrome DevTools device
   toolbar, custom size, DPR 1 for both — DPR is irrelevant to the CSS-px bug this is
   checking for). Compare the *proportions* between the two, not just that both look
   individually fine.
2. **Screenshot with `?safe=1`** (kills particles) and without, so particle motion
   doesn't mask a layout problem underneath it.
3. **Check all 6 themes**, not just the one open in the editor — `hanabi`, `christmas`,
   `newyear`, `easter`, `halloween`, `summer` (admin "Giao diện" tab, or `THEMES` in
   `themes.js`). Easter and — to a lesser extent — Halloween are light/warm-toned outliers
   among mostly-dark themes; a contrast fix that only accounts for dark themes will often
   fail on Easter specifically.
4. **Measure, don't eyeball, these three things:**
   - **Outline scaling**: compute `--outline-w` at both viewports (DevTools → computed
     style on `.card-name`) and confirm the ratio matches the root `font-size` ratio
     (2× at 3840 vs 1920). If it doesn't move at all between the two, the outline is
     back to a hardcoded-px regression (see Known Traps #1).
   - **Contrast**: pull the actual computed `--text` / `--card-bg` (or `--bg`) pair for
     the theme under test and run it through a contrast-ratio checker. Card text sits on
     `--card-bg` over a photo, and the header/idle-logo strokes sit on `--bg`/gradient —
     check both, since the card scrim (`.card-body` gradient) is what actually saves
     contrast over busy food photos, not the theme's `--text` color alone.
   - **Distance legibility**: the panels are 49.5" 4K viewed from 3–5m. As a rough proxy
     without a physical panel, shrink the browser window/zoom until the rendered menu
     card roughly matches the apparent size a 49.5" screen would have at 4–5m from your
     own monitor, and check whether dish names and prices are still confidently readable
     at a glance — not just technically legible up close. Body/description text is
     allowed to be a skim; dish name and price must not be.
5. **Category glyph coverage**: if anything touches `CATEGORY_GLYPH_KEY` /
   `CATEGORY_GLYPH_ICONS` in `display.js`, cross-check every key against the *actual*
   category values in use — `public/assets/js/seed-data.js` uses `ramen`, `sushi`, `don`,
   `przystawki`, `desery`, `napoje` — not the aliases you might guess (`donburi`, `grill`,
   `dessert`, `drink`...). A mismatched key fails silently into the generic `plate` icon
   with no error anywhere (see Known Traps #3) — the only way to catch it is to check the
   rendered glyph per category against the map, not to read the map and assume it's wired
   up.
6. **Admin panel**: check at a real phone width (~375–430px) and desktop, logged in.
   Vietnamese text (no diacritics-in-Latin-font problem here, but still check wrapping —
   Vietnamese strings run long) and check the pagination-preview iframes on the "Xem
   trước" tab actually match `pagination.js`'s real output (see README's "two things to
   know before editing" — the algorithm must not be duplicated, so a visual mismatch
   between preview and real screen is a data/wiring bug to report up, not something this
   skill's checklist fixes visually).

## Known traps — check these specifically, they've already happened once

| Trap | What broke | What to check now |
|---|---|---|
| Outline width didn't scale | `--outline-w` was written with a hardcoded `px` unit; at 4K the dish-name font doubled but the text-stroke outline didn't, reading as half the intended weight | Confirm sizes derive from `rem`/the `--outline-w-base` × root-font-size formula, never a raw `px` literal on anything that also has a `rem`-scaled font size nearby |
| Bitmap placeholder glyph pixelated at 4K | The no-photo placeholder was a system emoji (bitmap, fixed OS-rendered resolution); scaled up via CSS for the 4K panel, it showed visible blocking | Any new icon/placeholder art must be vector (inline SVG in `currentColor`, matching the pattern in `display.js`'s `CATEGORY_GLYPH_ICONS`), never a raster image or emoji character used at a size larger than its native rendering |
| Category keys silently didn't match | The glyph-lookup map's keys (`donburi`, `grill`, `dessert`, `drink`...) never matched the real `category` values the data actually uses (`don`, `przystawki`, `desery`, `napoje`...), so every dish quietly fell back to the generic icon with zero errors | Whenever a map/lookup keys off `item.category` (or any other Firestore field), diff its keys against the real values in `seed-data.js` and/or the admin's category input — don't assume a key you'd guess is the key the data uses |

## Quick file / property map

| Concern | Lives in |
|---|---|
| Root font-size / resolution-independence mechanism | `public/assets/css/display.css`, `html { font-size: clamp(...) }` near the top |
| Theme colors, fonts, particle type per season | `public/assets/js/themes.js` (`THEMES`, `applyTheme`) |
| CSS variables consumed by the screens | `public/assets/css/display.css`, `#app { --bg / --text / --outline / --outline-w-base / --accent / --price / --card-bg / --font-heading / --font-body / --overlay-image }` |
| Particle perf budget (resolution cap, fps cap, particle counts) | `public/assets/js/effects.js` (`MAX_BACKING_W/H`, `TARGET_FPS`, `CAPS`) |
| Page/card transition animations | `public/assets/css/display.css`, `.t-fade` / `.t-slide` / `.t-flip` / `.t-curtain` rules, `@keyframes kenBurns`, `@keyframes burnInDrift` |
| Category → placeholder glyph mapping | `public/assets/js/display.js` (`CATEGORY_GLYPH_KEY`, `CATEGORY_GLYPH_ICONS`, `glyphFor()`) |
| Real category values in use | `public/assets/js/seed-data.js` (`category: "..."` fields) and the admin's dish editor |
| Price/currency formatting | `public/assets/js/display.js` (`formatPrice()`) |
| Grid layout by item count (1–6 per page) | `public/assets/css/display.css`, `.menu-grid-layer[data-count="N"]` rules |
| Admin panel styling | `public/admin/admin.css` |
| Hardware constraints and the reasoning behind all of the above | `docs/ARCHITECTURE.md` §9 |
