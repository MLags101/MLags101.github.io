# Site guide

A map of this repo: where things live, which file to open for common changes, and how a page gets built. Detailed how-tos are in [`docs/`](docs/).

## The one idea to remember

| Folder              | What's in it                                   | You edit it when…                                         |
| ------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| **`src/data/`**     | **Facts**, as plain YAML files                 | a date, skill, spec, featured pick or contact detail changes |
| **`src/content/`**  | **Write-ups** (text + photos) for each project | you're telling the story of a project                     |
| `public/`           | Big files served as-is: videos, 3D models, resume PDF | you add a video / model / new resume                |
| `src/components/`, `src/pages/`, `src/styles/` | How the site looks and works | you want to change the design or add a feature |

Everything else is plumbing you rarely touch.

## "I want to…" → open this

| I want to…                                   | Open / run                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Change a project's dates, specs, cover, featured status | `src/data/projects.yaml` → find the project's block                              |
| Change which tools a project used            | `src/data/skills.yaml` → add/remove the project's slug in each tool's `projects:` |
| Edit a project's text or photos              | `src/content/projects/<slug>/index.mdx` and its `images/` folder                            |
| Add a new project                            | `npm run new` (creates both of the above with `draft: true`)                                |
| Change which projects show on the home page  | `featured: true` / `order:` in `src/data/projects.yaml`                                     |
| Add or edit a job, internship, lab or team   | `src/data/experience.yaml` (or `npm run new -- experience "Org"`)                           |
| Add a paper / poster / talk                  | `src/data/research.yaml`                                                                    |
| Add, rename or remove a tool                 | `src/data/skills.yaml`                                                                      |
| Change name, tagline, "Aspiring Roboticist" line, email, links, GPA, nav | `src/data/site.yaml`                                            |
| Replace the resume PDF                       | overwrite `public/resume/Michael-Lagana-Resume.pdf`                                         |
| Add a company / org logo                     | square PNG/SVG in `src/assets/logos/`, then `logo: file.png` in `experience.yaml`           |
| Add a video                                  | add a job to `scripts/videos.json` → `npm run media:videos` → `<Video src="/media/…" />`     |
| Add a 3D CAD model with labeled parts        | `npm run model:optimize -- file.glb <id>` → edit `src/data/models/<id>.yaml` ([guide](docs/3D-MODELS.md)) |
| Recolor a 3D model                           | `appearance:` in `src/data/models/<id>.yaml` → re-run `model:optimize`                      |
| Add an articulated robot (URDF)              | `npm run robot:import -- <ros-package-folder> <id>` → edit `src/data/robots/<id>.yaml` ([guide](docs/3D-MODELS.md#part-2--robots-from-urdf-robotviewer)) |
| Add an interactive PCB (Gerbers + STEP)      | `npm run pcb:import -- <design-folder> <id>` → `<PcbViewer id="<id>" />` ([guide](docs/3D-MODELS.md#part-3--circuit-boards-pcbviewer)) |
| Change the home page slideshow               | `heroSlides:` in `src/data/site.yaml` (files in `public/media/`)                           |
| Make a lab the big section on /research      | `featured: true` (+ `gallery`, `video`, `advisor`, `orgUrl`) in `src/data/experience.yaml` |
| Draw / edit a block diagram                  | `src/data/diagrams/<id>.yaml` → `<Diagram id="<id>" />`                                     |
| Change colors, fonts, spacing                | `src/styles/tokens.css`                                                                     |
| Check everything before pushing              | `npm run lint:content` then `npm run build`                                                 |

## Folder map

```
├─ SITE_GUIDE.md            ← you are here
├─ README.md                quick start + commands
├─ docs/
│   ├─ CONTENT.md           every field in every data file, component cheat sheet
│   ├─ MEDIA.md             photos, video encoding, the _archive folder
│   └─ 3D-MODELS.md         CAD → GLB → labels, coloring, animations, URDF robots, PCBs
│
├─ src/
│   ├─ data/                ★ FACTS — hand-editable YAML
│   │   ├─ site.yaml          name, identity line, contact, education, nav, home slideshow
│   │   ├─ projects.yaml      one block per project (dates, specs, cover…)
│   │   ├─ experience.yaml    jobs, labs, teams (promotion ladders, resume bullets)
│   │   ├─ research.yaml      papers, posters, talks, ongoing work
│   │   ├─ skills.yaml        tools, and which projects used each one
│   │   ├─ models/<id>.yaml   3D model: hotspots, camera, colors, animations
│   │   ├─ robots/<id>.yaml   URDF robot: poses, sequence, colors
│   │   ├─ pcbs/<id>.yaml     circuit board: name, alt text, which 3D model
│   │   └─ diagrams/<id>.yaml block diagram: nodes, links, traceable flows
│   │
│   ├─ content/projects/<slug>/   ★ WRITE-UPS
│   │   ├─ index.mdx          the story (Markdown + components)
│   │   └─ images/            that project's photos and renders
│   │
│   ├─ assets/              site photos (portrait, team) and logos/ — optimized at build
│   ├─ components/
│   │   ├─ media/           Figure, Gallery, Video, CompareSlider, ImageHotspots,
│   │   │                   ModelViewer (GLB), RobotViewer (URDF), PcbViewer (Gerber), Lightbox
│   │   ├─ data/            Diagram, Gantt, SpecSheet, BuildLog, LineageStrip
│   │   ├─ cards/ layout/ ui/   ProjectCard · Header/Footer/Theme · Callout, Columns, Icon
│   ├─ layouts/             BaseLayout (every page), PageLayout, ProjectLayout
│   ├─ pages/               one file per URL: index, projects/, experience/, research, about, resume, 404
│   ├─ lib/                 content.ts (queries + computed links), dates.ts, media.ts
│   ├─ styles/              tokens.css (design tokens), base, prose, motion, print, parts
│   ├─ content.config.ts    the schemas — why bad data fails the build
│   └─ site.config.ts       loads + validates site.yaml (don't edit)
│
├─ public/                  served as-is at the site root
│   ├─ media/<slug>/        encoded videos + poster frames
│   ├─ models/<id>/         model.glb, parts.json, poster.webp
│   ├─ robots/<id>/         URDF + compressed meshes (from robot:import)
│   ├─ pcbs/<id>/           board renders, per-layer SVGs, manifest.json (from pcb:import)
│   └─ resume/              the PDF
│
├─ scripts/                 the tools behind `npm run …` (see below) + templates/
├─ .github/workflows/       CI (checks every branch) and Deploy (publishes main)
└─ _archive/                git-ignored, local only: old site, originals, raw CAD + video
```

## How a project page is assembled

```
src/data/projects.yaml  ─┐  title, dates, role, specs, cover, lineage…
src/data/skills.yaml    ─┤  which tools it used
                         ├─▶  src/layouts/ProjectLayout.astro  ─▶  /projects/<slug>
src/content/projects/    │      header · hero (photo, video or 3D) · sidebar · related ·
  <slug>/index.mdx  ─────┘      prev/next — and your write-up in the middle
```

The same `projects.yaml` entry also feeds:
- the project's card on `/projects` and the home page
- the filters
- the Experience timeline's "projects from here"
- the "used in N projects" skill counts
- the version strip on related projects

Change a date once and every place updates.

## Commands

| Command                                         | What it does                                                    |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                                   | Local site at http://localhost:4321 with live reload; drafts visible |
| `npm run new`                                   | Scaffold a project / experience / research entry / skill        |
| `npm run lint:content`                          | Catches missing files, unused photos, bad part names, TODOs     |
| `npm run build`                                 | Type-check + production build into `dist/`                      |
| `npm run preview`                               | Serve `dist/` exactly as it will deploy                         |
| `npm run media:videos`                          | Encode the jobs in `scripts/videos.json` (needs ffmpeg)         |
| `npm run model:optimize -- in.glb <id>`         | Compress a CAD export, record its parts, apply `appearance:`    |
| `npm run model:parts -- <id> [filter]`          | List a model's CAD part names (for hotspot `part:`)             |
| `npm run robot:import -- <folder> <id>`         | URDF package (STL/DAE meshes) → compressed GLB meshes + YAML    |
| `npm run pcb:import -- <folder> <id>`           | Gerbers (+ STEP) → board renders, layer views, 3D board model   |

**Dev-only extras:**
- Add `?author` to any page URL in `npm run dev` for the hotspot and poster capture helpers.
- `/dev/components` shows every component on one page.

## Publishing

1. Work on a branch, then push. CI runs the type check, content lint, build and link check.
2. Merge to `main`. The **Deploy** workflow builds and publishes to https://mlags101.github.io.
   - One-time setup: repo **Settings → Pages → Source: GitHub Actions**.

## When something breaks

| Symptom                                               | Usual cause                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| Build error naming `projects.yaml` and a field        | Typo or wrong type there. Read the field name in the message.       |
| `Image "x.jpg" not found for project "…"`            | File name typo, or the photo isn't in that project's `images/`      |
| A spec value is cut off at a comma                    | Quote it: `value: "a, b"`                                            |
| `no CAD part named "…"`                               | Check spelling with `npm run model:parts -- <id>`                   |
| 3D model looks lavender / washed out                  | Uncolored SolidWorks parts. Add `appearance:` or color them in CAD |
| `ffmpeg not found`                                    | `winget install -e --id Gyan.FFmpeg`, then open a new terminal       |
