# Floor Plan Editor

A lightweight, offline 2D floor-plan and elevation editor that also produces
reference material (a PNG line-art sheet + text prompts) for handing to an
external AI image generator such as Gemini/Imagen.

No install, no build step, no server, no account. Download the folder,
double-click `index.html`, and you're drawing.

[繁體中文版說明請見 README.zh-TW.md](README.zh-TW.md)

## Highlights

- Pure front-end single-page app — works fully offline, all libraries are
  bundled locally in `vendor/`
- Draw rooms, furniture, doors/windows, and electrical sockets on an
  infinite, snapping, zoomable canvas
- Six-view elevation mode (Top / Right / Bottom / Left / Ceiling / Floor)
  generated automatically from your floor plan — no separate drawing needed
- AI Export: a 2×3 grid PNG of clean line-art views plus ready-to-paste
  text/JSON prompts, so you can hand your plan to an image model and get a
  photorealistic render back
- Undo/redo, sticky notes, and one-click JSON/PNG/PDF export
- English and Traditional Chinese UI out of the box, more languages easy to
  add (see the very bottom of this file)

## Getting Started

1. Download or `git clone` this repository.
2. Open `index.html` in a modern browser (Chrome, Firefox, Safari, or Edge)
   — either by double-clicking it, or by serving the folder with any static
   file server if you prefer (e.g. `python3 -m http.server`).
3. Start drawing.

Your work saves itself automatically to the browser's local storage as you
go (see **Autosave** below) — there's no explicit save step to remember.

## User Guide

### Rooms

Pick the **Room** tool in the left toolbar, then press, drag, and release on
the canvas to draw a rectangular room. Edges snap to the grid and to other
rooms as you draw. Select a room to edit its name, width/depth, fill color,
and exact X/Y position/size in the right panel — typing a number there also
snaps to nearby room edges within 5 cm.

### Furniture, Lighting & Structural Items

Open the **Furniture** submenu in the left toolbar for three groups:

- **Furniture** — rectangle, circle, or triangle, for anything you want to
  represent abstractly (sofas, tables, beds, ...)
- **Structural** — beam
- **Lighting** — ceiling light, floor lamp, table lamp

Press, drag, and release inside a room to place an item at a sensible
default size (unlike rooms, furniture isn't drawn to a custom size on
placement — resize it afterward with the selection handles). An item must
land fully inside a room, or fully inside the combined footprint of several
adjacent rooms if it spans an opening between them; an invalid drop shows a
brief message and reverts.

Select an item to edit its name, size, fill color, position, and rotation
(type an angle 0–359°, or use the **↻ 90°** quick-rotate button). A small
arrow on the item always marks which way is "front."

### Doors, Windows & Sockets

The **Openings** tool places doors and windows: drag near any room's wall
and it snaps onto that wall, showing a live crosshair as you drag. Once
placed, fine-tune its position along the wall, its height off the floor,
and its own height in the right panel. Two openings can't overlap on the
same wall — an invalid position is rejected with a short message.

The **Socket** tool places electrical outlets anywhere inside a room, with
the same height fields as openings.

### Sticky Notes

The **Note** tool drops a small annotation anywhere you click — unlike
furniture, a note isn't confined to a room's bounds. Select it to type or
edit its text in the right panel. Notes are scoped to whichever context you
placed them in: floor-plan notes are their own set, and each of the six
elevation views (Top/Right/Bottom/Left/Ceiling/Floor) of a room keeps a
fully separate set from the others and from the floor plan — a note only
ever shows up in the exact view you put it in, since its position only
means something there. Note text is included in AI Export's prompts, so a
note like "this wall gets direct afternoon sun" or "keep this corner clear
for a plant" actually reaches the image model.

### Selecting, Multi-Select & Alignment

- **Select tool** — click an item to select it
- **Shift/Ctrl+click** — add to the selection
- **Drag on empty canvas** — rubber-band select everything inside the box
- **Hold Space + drag** — pan the canvas
- **Arrow keys** — nudge the current selection by 1 cm
- **Delete / Backspace** — delete the current selection
- **Ctrl/Cmd+Z** — undo, **Ctrl/Cmd+Shift+Z** (or **Ctrl+Y**) — redo
- **Ctrl/Cmd+S** — save immediately (autosave already covers you; this is
  just for peace of mind)
- With 2+ items selected, the right panel offers batch **Align**
  (left/right/top/bottom/center-H/center-V) and **Delete all**

### Elevation View

Click **Elevation** in the top bar (enabled once you have at least one
room) to switch from the floor plan to a wall-by-wall view. Pick a room,
then a view tab — the tabs are named for where you're standing (e.g. the
**Top** tab shows the wall you're facing when standing at the top of the
room, looking down). **Ceiling** and **Floor** are the reflected-ceiling and
plan views.

Every item shown here has the same three height fields (from floor / object
height / from ceiling) — edit any two and the third is calculated
automatically from the room's ceiling height, no lock icon needed, it just
tracks whichever two fields you touched most recently. Un-rotated items also
get an editable horizontal position (from left / from right / width) that
writes straight back to the floor plan; rotated items show this read-only,
since their apparent width in this view isn't their stored width — go back
to the floor plan to resize those.

The minimap (top-right of the floor plan) highlights the current room and,
for a wall view, draws an arrow on that wall showing which direction you're
looking, using the same convention architects use for elevation markers on
a real blueprint.

### AI Export

Click **AI Export** in the top bar (enabled once you have a room). Check
one or more rooms, pick a style preset (Industrial / Scandinavian / Modern
Minimalist) or type your own — a style description works best in English,
since it's headed for an English-oriented image model. With multiple rooms
selected you can flip between each room's own material and a **Combined**
tab that merges all of them into one grid and one prompt.

Each room (or the combined set) gives you:

- **6-Grid PNG** — a white-background, black-line-only sheet of the six
  elevation views, meant to be uploaded as a reference/sketch image
- **Prompt** — one paste-ready English sentence describing the room, style,
  and what to avoid
- **JSON Prompt** — the same information as structured JSON, for models
  that parse structured input better

Suggested flow: download the PNG, upload it to your image model as a
reference, paste the Prompt or JSON Prompt, generate.

### Settings

The gear icon opens Settings: measurement unit (metric now, imperial
planned), default wall thickness, UI language, and grid visibility/spacing/
color.

### Saving, New/Open & Export

Every change is saved to the browser's local storage a moment after you
make it — there's a **Save** button in the top bar too if you want to force
it immediately, but you generally don't need to think about saving at all.
This is per-browser, per-device storage: it doesn't sync across machines or
survive clearing site data. **New** (or the 🗑 button next to Undo/Redo)
clears the current drawing after confirming — this app only ever has one
drawing open at a time, so the two buttons do the same thing.

To move a project between browsers/devices, or keep a dated backup, use
**Export ▾ → Export JSON**, then **Open** that file later (on any device)
to load it back in — it fully replaces whatever's currently on the canvas,
after a confirmation.

**Export ▾ → Export PNG/PDF** captures exactly what's on screen right now
— whatever pan/zoom you're currently at, floor plan or elevation view —
as a single image or single-page PDF. It's a snapshot of your current
view, not a multi-page technical document covering every room and view.

## Not Yet Built

Being upfront about what this version doesn't do yet: uploading a
background image to trace over (the Background layer toggle exists, but
nothing populates it yet). Nothing else is a hidden or broken feature —
just not built yet.

## Tech Stack

- [Konva.js](https://konvajs.org/) — canvas rendering and interaction
- [Vue 3](https://vuejs.org/) — UI state (Composition API, no build step,
  loaded from a plain `<script>` tag)
- All dependencies are vendored locally in `vendor/` — nothing is fetched
  over the network at runtime

## Contributing a Translation

Adding a UI language is a small, self-contained task — see
[`locales/AGENTS.md`](locales/AGENTS.md) for the exact procedure.
