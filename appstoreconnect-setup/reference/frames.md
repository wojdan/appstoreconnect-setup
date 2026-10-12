# Stage 2: the screenshots ("frames")

A frame is a claim in two short lines over a drawn screen of the app, on one of the kit's background tones. The set
tells the product in the order a stranger needs: the store's search results show only the first frames, at about a
third of a phone's width, so the first claim has to carry the product alone and every claim has to read at that size.

## 1. Propose the set, in words

Before any design: a table in the chat, one row per frame, with the claim (two lines, where it breaks), the screen
under it, and the background tone. Three to ten frames; five or six is a good set.

An order that works, to adapt and not to copy:

| # | What the frame says | The screen under it |
|---|---|---|
| 1 | the promise, or how little it takes to start | the first thing the person sees or does |
| 2 | it fits *you* | the screen where it is set up for the person |
| 3 | the mechanism nobody else has | that mechanism, mid-use |
| 4 | the question the product answers | the main screen in its plain state |
| 5 | what using it is like | the same screen while something is happening |
| 6 | where it stops; what it will not do to you | the end state |

Rules for claims:

- Two lines, each short enough for the frame's inner width at the display size (the renderer measures; as a guide,
  under twenty Latin characters a line). One idea a claim. No claim repeats another.
- The product's own tone and its own words: a claim that names a feature uses the feature's name from the app.
- No promise the app does not keep, no "best" and no "#1".
- Other languages run longer (German and French by a third); a claim that only just fits in the source language will
  not fit there. Leave air.

Rules for screens:

- Real content, never lorem: the texts a person would actually see on that screen, taken from the app (rule 3 of
  the skill). Where a screen shows something the person typed (a name, a title), invent a plausible one and list its
  place in `notAppText` in `store/store.config.json`: `frames.2.title` is the field `title` of the second frame,
  `video.cards.<card>.<field>` a field of a card, `*` stands for anything.
- One screen per frame, cropped or scaled so that the part the claim talks about is in the upper two thirds; the
  screen may run out of the frame's bottom edge.
- Each frame on a different tone of the kit where the kit has several, so the set reads as a row.

Wait for the owner's answer. Expect to rewrite claims twice.

## 2. Design it on a new page

Send one brief (`claude-design.md`) for a **new** page, `store-v1.dc.html`:

- every frame a `<section>`, the frame itself an element `.store-frame` (or the kit's own class for it) of exactly
  **440 × 956 CSS px**, with the claim in an `<h1 class="store-frame__title">` whose two lines are two `<span>`s, and
  the screen inside `.store-frame__screen`;
- the frame's classes (background tone, a shape, the lockup with the name if wanted) added to the kit as components,
  like everything else;
- the screen built from the kit's existing components, in the light theme unless the owner chose otherwise;
- every text given to the letter;
- next to each frame, the same frame at one third of its width, so legibility is visible on the page.

Export, screenshot, check (`claude-design.md`). Show the owner the page's screenshots with your judgement. Iterate:
each version is a new page (`store-v2…`), at most three correction rounds on one version. Keep every page; the owner
often goes back to an earlier one.

## 3. Turn the approved page into templates

When the owner says the set is right:

1. Save the page to `store/design/` and the kit to `store/kit/`; point `css` in the configuration at the kit, and put
   any frame classes that live on the page rather than in the kit into `store/frames/frames.css`.
2. For each frame, copy its `.store-frame` element into `store/frames/template/frame-<n>.html` on one line, and
   replace every text with a `{{field}}`: `{{claim}}` for the whole inside of the title (the renderer writes the
   lines as `<span>`s), and a named field for every other text (`{{title}}`, `{{primary}}`, …), `aria-label`s
   included. Icons, shapes and structure stay as they are.
3. Put the texts into `store/frames/texts/<source>.json`: `{"frames": [{"claim": ["line", "line"], "title": …}, …]}`.
4. In the configuration: `frames.css` (the frame's CSS size), `frames.scale` and `frames.claimWidth` (the frame's
   width without its side padding), and `frames.selectors` if the kit's class names differ from the defaults
   (`frame`, `claimLines`, `screen`, `clip`: the element a text must not leave, usually a button or a card).
5. `node SKILL_DIR/tools/render-frames.mjs <source>` and `node SKILL_DIR/tools/sheet.mjs <source>`. Compare each rendered frame
   with the page's screenshot of it: same text, same position, same colours. Then `python3 SKILL_DIR/tools/texts.py`.

**Size.** A frame is designed in CSS px and painted at a whole scale, which keeps every edge on the pixel grid:
440 × 956 at 3 gives 1320 × 2868, 402 × 874 at 3 gives 1206 × 2622. Check `specs.md` and Apple's page for the sizes
App Store Connect takes today; one size is enough, the store scales it for the other iPhones. PNG without alpha: the
renderer removes it.

## 4. Approval

Show the owner the rendered frames (the contact sheet and the full-size files). On their yes:

- write the approval into `store/PROGRESS.md` with the date and their words;
- copy the approved files from `store/out/<source>/` to `store/approved/<source>/`: the renderers only ever write to
  `store/out/`, so the approved copies stay as they are;
- from now on, after any change to a template, the kit or a tool, render the source language again and
  `node SKILL_DIR/tools/compare.mjs` each file in `store/out/` with its approved twin. No differing pixel, or the
  owner decides.

## What goes wrong

- **A claim line too wide** (the renderer warns): break the same words elsewhere; if no break fits, the words change,
  and in a language other than the source that is its editor's decision (`languages.md`), measured on a render.
- **A long label wraps or is cut inside the screen**: it is the app's own text, so it cannot be shortened here. Leave
  it when the screen still reads like a phone screenshot would; otherwise choose another screen for that frame.
- **The last line of a screen is cut by the frame's bottom edge**: fine when the screen visibly runs out of the frame,
  wrong when the edge runs through the one thing the claim is about.
- **A right-to-left language**: the frame is mirrored, as the app is on a phone set to that language. What the kit
  lays out with flex or grid follows `dir="rtl"` by itself; what it places with `left` and `right` (a shape in a
  corner, an arrow, a bar's padding) goes into `store/rtl.css`.
- **Japanese, Korean, Chinese**: the renderer puts the system's face behind the kit's, removes tracking, lets the
  title's line out and balances the lines; check that no character stands alone on a last line.
