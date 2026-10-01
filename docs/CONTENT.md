# Writing content

Everything on the site comes from `src/content/`. Pages are generated from it — you never edit HTML.

## Workflow

1. `npm run new` → answer the prompts. A new entry is created with `draft: true`.
2. `npm run dev` → open the printed URL. Drafts show with a yellow **DRAFT** badge and never ship.
3. Write, add photos, refresh. Schema errors appear in the terminal and the browser overlay.
4. Set `draft: false`, run `npm run lint:content`, commit, push.

## Projects — `src/content/projects/<slug>/index.mdx`

The folder name is the URL: `projects/kermit-v3/` → `/projects/kermit-v3`.
Photos go in `images/` next to it and are referenced **by file name only**.

| Field         | Required | Notes                                                                                  |
| ------------- | -------- | -------------------------------------------------------------------------------------- |
| `title`       | ✓        |                                                                                        |
| `summary`     | ✓        | ≤ 220 chars. Card text, page lede and meta description.                                |
| `category`    | ✓        | `research` · `professional` · `team` · `personal` · `coursework`                       |
| `start`       | ✓        | `YYYY-MM`. If you only know the finish month, set `start` = `end`.                     |
| `end`         |          | `YYYY-MM`. Omit for ongoing work.                                                      |
| `status`      |          | `complete` (default) · `in-progress` · `paused` · `concept`                            |
| `featured`    |          | `true` puts it on the home page. Keep 3–6 featured.                                    |
| `order`       |          | Higher sorts first among featured projects and ties.                                   |
| `draft`       |          | `true` = dev only.                                                                     |
| `cover`       | ✓        | `./images/file.jpg` — card thumbnail, hero and social-share image.                     |
| `coverAlt`    | ✓        | What the cover shows, for screen readers.                                              |
| `role`        | ✓        | "Sole designer", "Drone Lead", …                                                       |
| `context`     |          | An experience id (`robonav`, `invention-studio`…) — links the project on that role.    |
| `team`        |          | Free text shown in the sidebar.                                                        |
| `skills`      | ✓        | Ids from `src/content/skills.yaml`. Unknown ids fail the build.                        |
| `specs`       |          | `- { label: Mass, value: 1.08 kg }` → the spec sheet.                                 |
| `lineage`     |          | `{ family: Kermit, version: V3, order: 3 }` → automatic version strip across projects. |
| `related`     |          | `[other-slug]` → "Related work".                                                       |
| `links`       |          | `- { label: …, url: …, kind: behance \| github \| video \| paper \| cad \| website }`  |
| `log`         |          | `- { date: 2025-05, title: …, note: … }` → build-log timeline.                         |
| `model`       |          | A 3D model id → replaces the hero image with the interactive viewer.                   |
| `heroVideo`   |          | `/media/<slug>/clip.mp4` → video hero.                                                 |

**Don't repeat metadata in the body.** Title, dates, role, skills and specs are rendered by the layout.

### Components you can use in the body (no import needed)

```mdx
<Figure src="frame.jpg" alt="What it shows" caption="Numbered automatically." />
<Figure src="schematic.png" alt="…" caption="…" contain />        {/* letterboxed, for drawings */}

<Gallery columns={3} aspect="4/3" caption="…" items={[
  { src: 'a.jpg', alt: '…', caption: 'optional per-image caption' },
  { src: 'b.jpg', alt: '…' },
]} />                                                              {/* fit="contain" for PCBs */}

<Video src="/media/<slug>/flight.mp4" caption="…" />              {/* poster = same name .jpg */}
<Video src="…" mode="ambient" />                                  {/* muted loop, plays on screen */}

<ImageHotspots src="render.png" alt="…" caption="…" points={[
  { x: 42.5, y: 18, label: 'Antenna', partNo: 'MT-07', detail: 'Why it matters.' },
]} />

<ModelViewer id="kermit-v3" caption="…" />                         {/* docs/3D-MODELS.md */}
<Diagram id="eevi-signal-chain" caption="…" />
<CompareSlider before="v1.jpg" after="v2.jpg" beforeLabel="V1" afterLabel="V2" alt="…" />
<SpecSheet specs={[{ label: 'Span', value: '450 mm' }]} />
<Callout tone="lesson">What broke and what you learned.</Callout> {/* note | lesson | result */}
```

Use another project's image with `src="eevi/img-2836.jpg"`.

**Finding hotspot coordinates:** open the page with `?author` on the URL in `npm run dev`
(e.g. `http://localhost:4321/projects/mr-toad?author`) and click the image — `{ x, y }` is copied
to your clipboard.

**Preview every component:** `http://localhost:4321/dev/components` (dev only).

## Experience — `src/content/experience/<slug>/index.md`

`org`, `mark` (≤6-char badge, e.g. `GTRI`), `location`, `type` (`internship` · `co-op` · `research` ·
`team` · `leadership`), `start`, `end?`, `positions` (newest first — several rows draw a promotion
ladder), `summary`, `highlights` (resume bullets), `skills`, `onResume`. Optional `logo: ./logo.png`
(square, next to the file) replaces the text badge. Any Markdown body appears under the highlights.

The `/resume` page is generated from entries with `onResume: true` plus `site.config.ts` education
and `featured` skills — keep it in sync with the PDF in `public/resume/`.

## Research — `src/content/research/*.md`

Outputs and threads: `title`, `kind` (`paper` · `poster` · `talk` · `thesis` · `report` · `ongoing`),
`date`, `venue`, `authors`, `summary`, `links`, `experience?`, `project?`. Lab roles themselves live
in `experience/` with `type: research`; research projects use `category: research`.

## Skills — `src/content/skills.yaml`

One line per skill: `{ id, name, group, featured?, aliases? }`. Groups: `languages`, `cad-sim`,
`electronics`, `robotics`, `fabrication`. `featured: true` = listed on the resume page. The home page
counts how many projects use each skill — no self-ratings.

## Diagrams — `src/content/diagrams/<id>.yaml`

```yaml
title: …
description: …            # read by screen readers
groups: [{ id: air, label: Aircraft }]
nodes:
  - { id: fc, label: Pixhawk, sub: flight ctrl, group: air, col: 0, row: 0 }
edges:
  - { from: fc, to: radio, label: MAVLink, kind: data }   # data | rf | video | power
```

Nodes sit on a grid (`col`, `row`; rows may be fractional). Edges route automatically.
