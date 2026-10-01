# Writing content

Two folders hold everything. You never edit HTML.

- **`src/data/`** — the **facts**, as plain YAML you edit by hand: dates, specs, tools, which projects are featured, your contact info. One file per kind of thing.
- **`src/content/projects/<slug>/`** — the **write-up** for each project (`index.mdx`) and its photos (`images/`).

A project's title, dates, role, tools and specs are rendered by the page layout from `projects.yaml`, so never repeat them in the write-up. The build checks the YAML: a typo'd skill id, a missing cover photo or an end date before the start fails with a message naming the file and field.

## Workflow

1. `npm run new`, then answer the prompts. This creates:
   - a block in `src/data/projects.yaml` with `draft: true`
   - `src/content/projects/<slug>/index.mdx` with a commented template
   - an `images/` folder with a placeholder cover
2. `npm run dev`, then open the printed URL. Drafts show with a **DRAFT** ribbon and never ship.
3. Write, add photos, refresh. Errors appear in the terminal and as a browser overlay.
4. Delete the `draft: true` line, run `npm run lint:content`, commit, push.

## Projects — `src/data/projects.yaml`

Each block's key is the **slug**: the URL (`/projects/kermit-v3`) and the folder name in `src/content/projects/`. Both halves must exist; the build tells you if one is missing.

```yaml
kermit-v3:
  title: Kermit V3
  summary: >-
    One or two sentences for cards and the page lede.
  category: personal
  start: 2026-04
  end: 2026-04
  featured: true
  cover: img-8094.jpg
  coverAlt: Kermit V3 on a table outdoors
  specs:
    - { label: Flight ctrl, value: Cube Orange · ArduPilot }
```

| Field       | Required | Notes                                                                                     |
| ----------- | -------- | ----------------------------------------------------------------------------------------- |
| `title`     | ✓        |                                                                                           |
| `summary`   | ✓        | ≤ 240 chars. Card text, page lede and search description.                                 |
| `category`  | ✓        | `research` · `professional` · `team` · `personal` · `coursework`                          |
| `start`     | ✓        | `YYYY-MM`. If you only know the finish month, set `start` = `end` (shown as one month).   |
| `end`       |          | `YYYY-MM`. Leave it out (or write `present`) for ongoing work.                            |
| `status`    |          | `complete` (default) · `in-progress` · `paused` · `concept`                               |
| `featured`  |          | `true` puts it on the home page. Keep 3–6 featured.                                       |
| `makerGrant` |         | `true` if an Invention Studio Maker Grant funded it. The home page's Maker Grants count adds these up. |
| `order`     |          | Higher sorts first among featured projects and ties.                                      |
| `draft`     |          | `true` = visible in `npm run dev` only.                                                   |
| `role`      | ✓        | "Sole designer", "Drone Lead", …                                                          |
| `context`   |          | An experience id (`robonav`, `invention-studio`…); links the project on that role.        |
| `team`      |          | Free text shown in the sidebar.                                                           |
| `cover`     | ✓        | A file name in this project's `images/` folder: card thumbnail, hero, share image.        |
| `coverAlt`  | ✓        | What the cover shows, for screen readers.                                                 |
| `model`     |          | A 3D model id (`src/data/models/<id>.yaml`); replaces the hero image with the 3D viewer.  |
| `heroVideo` |          | `/media/<slug>/clip.mp4` gives a video hero.                                              |
| `specs`     |          | `- { label: Mass, value: 1.08 kg }`, shown as the spec sheet. Quote values with commas: `value: "a, b"`. |
| `lineage`   |          | `{ family: Kermit, version: V3, order: 3 }` builds an automatic version strip.            |
| `related`   |          | `[other-slug]`, shown under "Related work".                                               |
| `links`     |          | `- { label: Code, url: https://…, kind: github \| video \| paper \| cad \| website }`     |
| `log`       |          | `- { date: 2025-05, title: …, note: … }`, shown as the build-log timeline.                |

> **YAML gotcha:** inside `{ … }` or `[ … ]`, put quotes around any text containing a comma or colon, e.g. `{ label: Frame, value: "PLA, printed arms" }`.

## The write-up — `src/content/projects/<slug>/index.mdx`

Plain Markdown (headings, lists, **bold**, links, tables) plus components. No frontmatter is needed.
Photos go in `images/` next to it and are referenced **by file name only**. To reuse another
project's photo, write `other-slug/photo.jpg`.

### Components (no import needed)

```mdx
<Figure src="frame.jpg" alt="What it shows" caption="Numbered automatically." />
<Figure src="schematic.png" alt="…" caption="…" contain />        {/* letterboxed, for drawings */}

<Gallery columns={3} aspect="4/3" caption="…" items={[
  { src: 'a.jpg', alt: '…', caption: 'optional per-image caption' },
  { src: 'b.jpg', alt: '…' },
]} />                                                              {/* fit="contain" for PCBs */}

<Columns widths="2fr 1fr">                                        {/* side by side; stacks on phones */}
  <Video src="/media/<slug>/wide.mp4" caption="…" />
  <Video src="/media/<slug>/phone.mp4" aspect="9/16" caption="…" />
</Columns>

<Video src="/media/<slug>/flight.mp4" caption="…" />              {/* poster = same name .jpg */}
<Video src="…" mode="ambient" />                                  {/* muted loop, plays on screen */}

<ImageHotspots src="render.png" alt="…" caption="…" points={[
  { x: 42.5, y: 18, label: 'Antenna', partNo: 'MT-07', detail: 'Why it matters.' },
]} />                                                              {/* x/y = % of width/height */}

<ModelViewer id="kermit-v3" caption="…" />                         {/* docs/3D-MODELS.md */}
<RobotViewer id="dum-i" caption="…" />                             {/* URDF — docs/3D-MODELS.md */}
<PcbViewer id="typhoon" caption="…" />                             {/* Gerbers — docs/3D-MODELS.md */}
<Diagram id="eevi-signal-chain" caption="…" />                     {/* src/data/diagrams/ */}
<CompareSlider before="v1.png" after="v2.png" beforeLabel="V1" afterLabel="V2" alt="…" />
<SpecSheet specs={[{ label: 'Span', value: '450 mm' }]} title="Wing" />
<Callout tone="lesson">One thing I'd do differently…</Callout>     {/* note · lesson · result */}
```

Tables are written in Markdown and styled automatically (good for BOMs):

```md
| # | Part | Qty | Unit | Total |
| -: | :-- | -: | -: | -: |
| 1 | MAD 5008 motor | 4 | $80 | $320 |
```

**Finding hotspot coordinates:** run `npm run dev`, open the page with `?author` on the URL, and click the image. The `{ x, y }` is copied to your clipboard.

## Experience — `src/data/experience.yaml`

Jobs, internships, labs, teams. The key (e.g. `robonav:`) is the id a project's `context` points to.

| Field                  | Notes                                                                       |
| ---------------------- | --------------------------------------------------------------------------- |
| `org`, `location`      | Required.                                                                   |
| `mark`                 | ≤ 6 chars badge text (shown when there's no logo).                          |
| `logo`                 | A file in `src/assets/logos/` (square PNG/SVG, transparent background).     |
| `type`                 | `internship` · `co-op` · `research` · `team` · `leadership`                 |
| `start`, `end`         | `YYYY-MM`; leave `end` out while ongoing.                                   |
| `positions`            | Newest first: `- { title: Electronics Master, start: 2024-08 }`. Dates optional. |
| `summary`              | A few plain sentences (≤ 480 chars) shown on the Experience page.           |
| `highlights`           | Resume bullets, used on `/resume` only.                                      |
| `photo`, `photoAlt`    | Optional photo in `src/assets/site/` shown with the entry, and its alt text. |
| `orgUrl`               | The org or lab website (a "Lab website" button on /research).              |
| `featured`             | Research labs only: `true` gives the lab the large section at the top of /research. |
| `advisor`              | Shown under a featured lab's name.                                          |
| `gallery`              | More photos on /research: `- { src: file.jpg, alt: … }` (a file in `src/assets/site/`) or `<project>/<file>.jpg` (a project image). Large for the featured lab, thumbnails on other labs' cards. |
| `video`                | A featured lab's video, e.g. `/media/<slug>/flight.mp4` (portrait is fine). |
| `skills`               | Tool ids from `skills.yaml` shown on the entry.                             |
| `onResume`             | `false` = timeline only, not on `/resume`.                                  |

## Research outputs — `src/data/research.yaml`

Papers, posters, talks, ongoing work. Research *positions* go in `experience.yaml` with `type: research`.
Fields: `title`, `kind` (`paper` · `poster` · `talk` · `thesis` · `report` · `ongoing`), `date`, `venue`, `authors`, `summary`, `links`, optional `experience` / `project` ids.

## Tools — `src/data/skills.yaml`

The one place a tool is defined, **and** where you say which projects used it:

```yaml
solidworks:
  name: SolidWorks
  group: cad-sim            # languages · cad-sim · electronics · robotics · fabrication
  resume: true              # listed in the Skills section of /resume
  projects: [eevi, kermit-v3, mr-toad]
```

- **Make a tool show up on a project:** add the project's slug to that tool's `projects:` list. Remove the slug to take it off.
- **Remove a tool:** delete its block. If an `experience.yaml` entry lists the tool, delete its id there too.
- **Add a tool:** run `npm run new -- skill "Name" --group cad-sim --projects a,b`, or copy a block.
- **Computed from these lists:** project pages' tool chips, the Projects filter and the home page's "used in N projects" counts.
- **`npm run lint:content`** warns about any project that no tool lists.

## Site info — `src/data/site.yaml`

Name, identity line, tagline, email, links, education, availability line, nav order and resume path.

**Home page slideshow (`heroSlides`):** the background of the home page hero, in order. Each slide is an image or a video in `public/`, with a caption and a link that show in the strip under the hero:

```yaml
heroSlides:
  - { video: /media/site/hero-urc.mp4, poster: /media/site/hero-urc.webp, caption: EEVi · URC 2025, href: /projects/eevi, seconds: 9 }
  - { image: /media/site/hero-arl.webp, caption: ARL swarm testbed, href: /projects/arl-swarm-testbeds }
```

`seconds` defaults to 7. A video's `poster` defaults to the `.jpg` next to it. Use landscape images about 1920 × 1280 WebP (see docs/MEDIA.md). A missing file fails the build.

## Diagrams — `src/data/diagrams/<id>.yaml`

```yaml
title: …            # → <title> for screen readers
description: …      # → <desc>
animate: true       # signal pulses travel the links while on screen (default true)
groups: [{ id: air, label: 'Aircraft' }]
nodes:              # col / row place it on a grid (row may be 0.5 etc.)
  - { id: fc, label: Pixhawk, sub: ArduPilot, group: air, col: 0, row: 0 }
edges:              # kind: data · rf · video · power
  - { from: fc, to: radio, label: MAVLink, kind: data }
flows:              # each becomes a "Trace" button that animates a packet along the path
  - { id: telemetry, label: Telemetry, path: [fc, radio, gcs] }
```

Use it with `<Diagram id="…" caption="…" />`. The diagram draws itself in on first view. Hovering or focusing a block highlights its links. All motion is off under reduced motion.
