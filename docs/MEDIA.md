# Photos & video

## Photos

- Put them in `src/content/projects/<slug>/images/` with **lowercase-kebab-case names**
  (`frame-v2.jpg`, not `IMG 6253.JPG`). GitHub Pages is case-sensitive; the build catches mistakes.
- Straight-from-phone files are fine: at build time Astro resizes them, converts to WebP and
  generates responsive sizes. For a lighter repo, keep sources ≤ 2400 px on the long edge.
- **Sideways photo?** Fix the file, not the page — rotate it in the Photos app or any editor and
  re-save. There's no CSS rotation anymore.
- Photos taken on a phone may contain GPS location. The migration stripped it from existing
  images; for new ones, export without location or re-save through any editor.
- Every image needs real `alt` text: say what's in the picture.

## Video

Videos are served from `public/media/<slug>/` (not optimized by the build), so encode them first:

1. Add a job to `scripts/videos.json`:
   ```json
   { "in": "C:/path/to/IMG_1234.MOV", "out": "public/media/<slug>/first-flight.mp4",
     "start": 3, "duration": 12, "audio": false }
   ```
2. `npm run media:videos` — H.264, ≤ 1280 px, ≤ 5 MB, plus a poster frame `first-flight.jpg`.
3. `<Video src="/media/<slug>/first-flight.mp4" caption="…" />`

One-off: `npm run media:videos -- in.mov public/media/<slug>/clip.mp4 --start 2 --duration 8`.

Needs ffmpeg on your PATH (`winget install -e --id Gyan.FFmpeg`, then open a new terminal).
If the poster comes out sideways, add `"rotate": "cw"` / `"ccw"` to the job and re-run with `--force`.

## The archive

`_archive/` (git-ignored, local only) holds everything removed in the 2026 redesign: the old Jekyll
site, unused photos/videos, and full-resolution originals of every migrated image
(`_archive/originals/`). `_archive/contact-sheet.html` shows each migrated image.
Also kept there: raw CAD exports (`_archive/cad-src/`) and the full-quality videos downloaded
from the old Behance pages (`_archive/media-src/behance/`), which `scripts/videos.json` encodes from. Back it up
somewhere — it is not in the repository. (Everything is also still in git history before the
`redesign/astro` branch.)
