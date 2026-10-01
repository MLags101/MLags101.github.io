# mlags101.github.io

Michael Lagana's engineering portfolio — projects, experience, research and resume.
Built with [Astro](https://astro.build), deployed to GitHub Pages by GitHub Actions.

## Quick start

```bash
npm install          # once (Node 22+; Windows: winget install OpenJS.NodeJS.LTS)
npm run dev          # http://localhost:4321 — live reload, drafts visible
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ exactly as it will deploy
```

Push to `main` → the **Deploy** workflow publishes the site. Every other branch / PR runs **CI**
(type check, content lint, build, link check).

## Where things live

**New here? Read [SITE_GUIDE.md](SITE_GUIDE.md)** — the map of the repo and a "I want to… → open this" table.

Short version: **facts** (dates, skills, specs, contact info) are hand-editable YAML in
`src/data/`; **write-ups** (text + photos) are in `src/content/projects/<slug>/`.

| I want to…                         | Do this                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Change a project's dates / skills / specs | `src/data/projects.yaml`                                             |
| Add a project                      | `npm run new` (or `npm run new -- project "Name" --category personal …`)    |
| Add a job / team / lab             | `src/data/experience.yaml` (or `npm run new -- experience "Org name"`)      |
| Add photos to a project            | Drop them in `src/content/projects/<slug>/images/`, reference by file name   |
| Add a video                        | Add a job to `scripts/videos.json`, run `npm run media:videos`               |
| Add a 3D model with labeled parts  | `npm run model:optimize -- export.glb <id>` → [docs/3D-MODELS.md](docs/3D-MODELS.md) |
| Add an articulated robot (URDF)    | [docs/3D-MODELS.md](docs/3D-MODELS.md#part-2--robots-from-urdf-robotviewer)  |
| Draw a block diagram               | `src/data/diagrams/<id>.yaml`, then `<Diagram id="<id>" />`                  |
| Update contact info / nav / school | `src/data/site.yaml`                                                         |
| Replace the resume PDF             | Overwrite `public/resume/Michael-Lagana-Resume.pdf`                          |
| Check content before pushing       | `npm run lint:content`                                                       |

Guides: **[docs/CONTENT.md](docs/CONTENT.md)** (every data field, component cheat sheet) ·
**[docs/MEDIA.md](docs/MEDIA.md)** (photos, video) · **[docs/3D-MODELS.md](docs/3D-MODELS.md)** (CAD, colors, animation, URDF).

## Design rules

Dark technical theme with a light toggle; one accent (`--accent`); tokens in `src/styles/tokens.css`.
Motion is purposeful (diagram signal flow, CAD camera moves, draw-ins) and disappears under
`prefers-reduced-motion`. Each fact lives in exactly one place — never repeat a project's
title/date/skills in its write-up; the layout renders them from `src/data/projects.yaml`.
