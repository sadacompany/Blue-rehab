# Blue Rehab — design system

Everything here is derived from two client files, not invented:

| Source | What it gave us |
| --- | --- |
| `ألوان منصة بلو.pdf` | The four official brand colours |
| `استشارة بلو.pdf` | The 1440×4875 landing artboard — every size, radius, stroke and spacing below was measured out of its vector geometry |
| `محتويات منصة بلو/` (Drive kit) | Logotype, mascot, identity star, section marks, cover photograph, team photos and bios |

The system lives in five stylesheets, loaded in this order from `client/src/main.tsx`:

```
tokens.css      the vocabulary — colour, type, space, radius, stroke, motion
base.css        page ground, headings, container, section rules
primitives.css  buttons, cards, stars, avatars, fields, modal
shell.css       header, footer, portal frame
pages.css       per-page composition
```

Only `tokens.css` holds literal values. Everything else refers to it — **99.6% of the
280 `font-size` declarations across the stylesheets resolve through a token**, and no
raw `font-weight` numbers or off-scale radii remain.

---

## 1. Colour

### Brand (from the palette PDF, verbatim)

| Token | Value | Use |
| --- | --- | --- |
| `--color-ink-900` | `#445056` | Body text, the privacy band |
| `--color-brand-600` | `#6495A2` | Button fill, star marks |
| `--color-brand-400` | `#80D6E5` | Accents on dark |
| `--color-brand-100` | `#B6DDE7` | Icon plates, quiet fills |

> The artboard fills its buttons with `#6F97A5`, which is 11/2/3 off `#6495A2`.
> The palette is the authority, so the system uses the official value — the
> difference is imperceptible and it keeps one blue rather than two.

### Surfaces and structure (from the artboard)

| Token | Value | Use |
| --- | --- | --- |
| `--color-sky` | `#ECFAFF` | Header bar, service cards |
| `--color-mist` | `#F7FAFA` | Team cards, footer |
| `--color-page` | `#F2F7F9` | Page ground under the wash |
| `--color-hero-ink` | `#F8FBFA` | Type over the hero photograph |
| `--color-accent` | `#506FFF` | The 3px card outline |
| `--color-rule` | `#000` | Section rules, button and avatar hairlines |

`--color-accent` sits outside the brand palette. It is kept as its own token
because it is load-bearing to the look — a vivid cool outline against a near-white
card is the single most recognisable thing about the design.

The page ground carries three soft radial gradients built from the brand tints.
The design file supplies these as two 2000×2000 bitmaps, but they carry no alpha;
dropped in as images they paint solid rectangles over the page, so they are
rebuilt in CSS.

---

## 2. Typography

**TS Safaa** for everything, **Ghaith Sans** for the logotype only (scoped to
`.wordmark`, so it can never leak into running copy).

Weights: `--weight-ultralight` (200) · `light` (300) · `regular` (400) ·
`medium` (500) · `bold` (700). The kit only ships Light, so 200 and 300 both
resolve to it; the step is reserved for when the real UltraLight cut arrives.

### Scale

Each step is the artboard size at its 1440 reference width, interpolated down to
a hand-set mobile size at 375. The `calc()` mid-term makes the curve continuous,
so nothing snaps at a breakpoint.

| Token | 1440 | 375 | Used for |
| --- | --- | --- | --- |
| `--fs-hero` | 44 | 30 | Page `h1` |
| `--fs-section` | 43 | 29 | Section headings |
| `--fs-hero-sub` | 33 | 20 | Hero subline |
| `--fs-card-title` | 30 | 22 | Card titles |
| `--fs-body-lg` | 25 | 18 | Card body, buttons |
| `--fs-nav` | 22 | 17 | Nav links |
| `--fs-name` | 20 | 17 | Person names |
| `--fs-meta` | 18 | 15 | Supporting meta, body default |
| `--fs-fine` | 17 | 14 | Bullets, fine print |
| `--fs-small` | 15 | 13 | Dense meta |
| `--fs-micro` | 14 | 12 | Table cells, chips |

`--fs-small` and `--fs-micro` are the only two steps not in the artboard. The
comp only had to draw marketing; the platform also has dashboards and tables. They
continue the same ratio downward and stop at 12px, below which the Arabic
letterforms start losing their dots.

> The previous stylesheet ran from 7px to 13px for almost everything — roughly
> half this scale. Raising it was the largest single change to the interior pages.

---

## 3. Geometry

Radii, measured off the artboard's own bézier corners:

| Token | Value | Measured on |
| --- | --- | --- |
| `--radius-xs` | 13px | Card buttons (220×68, 202×63) |
| `--radius-sm` | 17px | Header buttons, media frames |
| `--radius-md` | 30px | Team cards (314×657) |
| `--radius-lg` | 50px | Service cards (555×522) |
| `--radius-full` | 999px | Pills, avatars |

Strokes: `--stroke-hairline` 1.5px (buttons, avatar rings) ·
`--stroke-card` 3px (the periwinkle outline) · `--stroke-rule` 1px (section rules;
the hero's is 2px).

Layout: `--container` 1180px (the artboard's content column measures ~1166) ·
`--header-height` 99px · `--space-section`, `--space-heading`, `--grid-gap` all fluid.

---

## 4. Components

| Class | What it is |
| --- | --- |
| `.button` | Brand fill, 1.5px black hairline, radius 13. `.button-small` for the header pills (radius 17), `.button-secondary` for the unfilled twin |
| `.star-heading` | `✦ خدماتنا ✦` — centred bold heading between two star-and-mascot marks. Rendered by `<SectionHeading>` |
| `.feature-card` | The service card: 3px accent outline, sky surface, radius 50 |
| `.person-card` / `.team-card` | The team card: circular portrait in a hairline ring, mist surface, radius 30 |
| `.poster-carousel` | دوراتنا and مقالاتنا: centre slide at full size with its neighbours peeking, plus the artboard's curved arrows |
| `.section-rule` | The full-bleed black hairline between bands. `.section-rule-strong` is the hero's 2px |
| `.star` | The four-point identity star, inline SVG, inherits `color` |

### The star

`<BrandStar />` normalises the path from `النجمة الزرقاء صيغة svg` (an 810×1080
artboard) onto a 24×24 box. It is the identity's connective mark: it separates
the nav items, flanks every section heading and leads each card bullet.

### The logotype

`<Brand />` sets `تأهيلــــ . بلو` in Ghaith Sans beside the mascot, with the
`بناء . لب . وعي` tagline underneath — the kit's lockup as **live text**, not a
flattened image, so it stays crisp and is readable to a screen reader. The
elongation is real tatweel (U+0640) and is decorative, so the link carries the
plain name in `aria-label`.

The font was recovered from the design PDF, which embeds the complete face
(1262 glyphs, full Arabic cmap) rather than a subset.

---

## 5. Landing page composition

The artboard defines the homepage band for band. In order:

```
header · hero · ─── · خدماتنا · ─── · فريقنا الطبي · ═══ · دوراتنا · ─── · مقالاتنا · ─── · privacy · footer
```

The privacy band and the footer appear in the design file as pasted screenshots
of what was already built, so they keep their layout and take only the system's
colour and type.

---

## 6. Rules of use

1. **Never write a raw `px` font size.** Pick the nearest step.
2. **Never write a `font-weight` number.** The face has four cuts; anything above
   700 is synthesised and smears.
3. **Cards get `--stroke-card` in `--color-accent`.** That outline is the design.
4. **Sections are separated by `.section-rule`,** not by background changes —
   the artboard has exactly one page ground.
5. **New colours go in `tokens.css` or not at all.**
