# 3D models with labeled parts

`<ModelViewer>` shows a GLB you can orbit, with numbered hotspots on parts and a parts list.
Selecting a part flies the camera to it. It uses Google's `<model-viewer>` (three.js under the
hood) and only downloads the 3D runtime and the model when the viewer scrolls into view.

## 1. Export from CAD

**SolidWorks** — *File → Save As → Extended Reality (`*.glb`)*. In options, export appearances,
and keep tessellation quality moderate. Name components meaningfully in the feature tree.

**Fusion 360** — export *OBJ* or *FBX*, open in Blender, *File → Export → glTF 2.0 (.glb)*.

Tips: hide fasteners and internal parts nobody will see; suppress fillets on tiny features;
apply simple appearances (PBR materials export, complex decals don't).

## 2. Optimize and register

```bash
npm run model:optimize -- "C:/exports/Kermit V3.glb" kermit-v3
```

This simplifies, quantizes and meshopt-compresses the mesh and converts textures to WebP, then
writes `public/models/kermit-v3/model.glb` and creates `src/content/models/kermit-v3.yaml`.
Target **≤ 5 MB** (ideally ≤ 3). Over budget? Re-run with `--ratio 0.25`.

## 3. Show it

In a project's MDX body:

```mdx
<ModelViewer id="kermit-v3" caption="Kermit V3 — select a part to inspect it." />
```

…or as the page hero: add `model: kermit-v3` to the project's frontmatter.

## 4. Author hotspots and the poster

1. `npm run dev`, open the project page with **`?author`**: `http://localhost:4321/projects/kermit-v3?author`
2. Orbit to a good angle on a part and **Shift+click** it. A YAML block with `position`, `normal`
   and the current camera `orbit` is copied to your clipboard (also printed in the browser console).
3. Paste it under `hotspots:` in `src/content/models/kermit-v3.yaml` and fill in `id`, `label`,
   `partNo` and `detail`. Save → the page reloads with the hotspot.
4. Frame the hero view and press **Save poster** (top-right in author mode). Move the downloaded
   `poster.webp` to `public/models/kermit-v3/poster.webp`. The poster shows instantly while the
   model loads, and is what phones see until they tap "Load 3D model".

```yaml
src: /models/kermit-v3/model.glb
poster: /models/kermit-v3/poster.webp
alt: Kermit V3 quadcopter airframe
sizeMB: 2.4
cameraOrbit: 35deg 70deg auto      # default view
hotspots:
  - id: fc
    label: Flight controller
    partNo: KV3-FC
    detail: Pixhawk on a vibration-isolated mount.
    position: "0.012m 0.043m -0.021m"
    normal: "0 1 0"
    orbit: "20deg 45deg 0.4m"       # optional — camera when this part is selected
```

`npm run lint:content` checks that every registered model has its GLB and poster.

## No GLB yet?

`<ImageHotspots>` does the same thing on a flat render — see Mr Toad's page. The props mirror
`<ModelViewer>` so you can swap a render for a model later without rewriting the labels.
