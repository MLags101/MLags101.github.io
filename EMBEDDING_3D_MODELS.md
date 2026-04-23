# Embedding 3D Models in Project Pages

Your portfolio uses [Google's `<model-viewer>`](https://modelviewer.dev/) — a web component that lets you embed interactive 3D models with a single HTML tag. The script is already loaded in the site layout, so you can use `<model-viewer>` on any page immediately.

---

## Quick Start

Place your `.glb` file in your project's folder (e.g., `MrToad/models/rover.glb`), then add this to your project page:

```html
<model-viewer 
  src="models/rover.glb" 
  alt="Mr Toad rover frame" 
  auto-rotate 
  camera-controls>
</model-viewer>
<p class="model-caption">Mr Toad — Rover Frame (drag to rotate, scroll to zoom)</p>
```

That's it. The viewer renders with the site's dark theme, rounded corners, and handles touch/mouse interaction automatically.

---

## How to Get a GLB File

`<model-viewer>` requires models in **GLTF** or **GLB** format. GLB is preferred since it bundles everything into a single file.

### From SolidWorks

1. Install the [SolidWorks glTF Exporter](https://apps.solidworks.com/) add-in, **or**:
2. Export as **STL** → open in **Blender** → File → Export → glTF 2.0 (.glb)

### From Fusion 360

1. File → Export → select **STL** or **OBJ**
2. Open in **Blender** → File → Export → glTF 2.0 (.glb)

### From KiCAD (3D PCB View)

1. In the PCB editor, go to **File → Export → STEP**
2. Open the `.step` file in **FreeCAD** or **Blender**
3. Export as **.glb**

### From Altium Designer

1. In the PCB editor, go to **File → Export → STEP 3D**
2. Open in **Blender** → Export as **.glb**

### Using Online Converters

- [gltf.report](https://gltf.report/) — drag-and-drop GLB optimizer/viewer
- [imagetostl.com](https://imagetostl.com/convert/file/stl/to/glb) — STL to GLB converter
- [Blender](https://www.blender.org/) (free, the most reliable option)

> **Tip:** Keep GLB files under **5 MB** for fast loading. In Blender, use the "Draco compression" option when exporting to reduce file size significantly.

---

## Available Options

Here are the most useful attributes you can add to `<model-viewer>`:

| Attribute | What it does |
|:----------|:-------------|
| `src="path/to/model.glb"` | Path to the 3D model file **(required)** |
| `alt="description"` | Accessibility description |
| `camera-controls` | Lets users rotate, zoom, and pan |
| `auto-rotate` | Model spins slowly when idle |
| `auto-rotate-delay="0"` | Start spinning immediately (default: 3000ms) |
| `rotation-per-second="30deg"` | Control spin speed |
| `shadow-intensity="1"` | Add a ground shadow (0 = none, 1 = full) |
| `exposure="1"` | Brightness control (default: 1) |
| `poster="path/to/preview.jpg"` | Image shown while model loads |
| `loading="lazy"` | Don't load until scrolled into view |
| `camera-orbit="45deg 55deg 2.5m"` | Set initial camera angle (theta, phi, radius) |
| `min-camera-orbit="auto auto auto"` | Limit how close user can zoom |
| `max-camera-orbit="auto auto auto"` | Limit how far user can zoom out |
| `disable-zoom` | Prevent zooming |
| `touch-action="pan-y"` | Allow page scrolling on mobile |

---

## Examples

### Basic (auto-rotate + controls)
```html
<model-viewer 
  src="models/frame.glb" 
  alt="Drone frame" 
  auto-rotate 
  camera-controls>
</model-viewer>
```

### With shadow and custom camera angle
```html
<model-viewer 
  src="models/pcb_assembly.glb" 
  alt="STM Remote PCB" 
  auto-rotate 
  camera-controls
  shadow-intensity="0.8"
  camera-orbit="30deg 60deg 0.1m"
  exposure="1.2">
</model-viewer>
```

### Lazy-loaded with poster image
```html
<model-viewer 
  src="models/rover.glb" 
  alt="Rover assembly" 
  camera-controls 
  auto-rotate
  loading="lazy"
  poster="images/rover_preview.jpg">
</model-viewer>
```

### Side-by-side models
```html
<div class="image-container">
  <model-viewer src="models/part_a.glb" alt="Part A" 
    camera-controls auto-rotate style="height: 350px; flex: 1;">
  </model-viewer>
  <model-viewer src="models/part_b.glb" alt="Part B" 
    camera-controls auto-rotate style="height: 350px; flex: 1;">
  </model-viewer>
</div>
```

---

## File Organization

Place model files in a `models/` subfolder inside each project directory:

```
MrToad/
├── index.html
├── images/
│   ├── rover_1.png
│   └── ...
└── models/
    ├── rover_frame.glb
    └── wheel_assembly.glb
```

---

## Styling

The viewer is already styled to match the site's dark theme (dark background, rounded corners, subtle border). If you need custom sizing on a specific embed, use inline styles:

```html
<model-viewer src="models/tiny_part.glb" alt="Small part"
  camera-controls auto-rotate
  style="height: 300px; max-width: 500px; margin: 0 auto;">
</model-viewer>
```

---

## Troubleshooting

| Problem | Solution |
|:--------|:---------|
| Model doesn't appear | Check the file path — it's relative to the HTML file, not the repo root |
| Model is very dark | Add `exposure="1.5"` or `environment-image="neutral"` |
| Model is too small/large | Adjust `camera-orbit` third value (radius) or re-export with proper scale |
| Slow to load | Compress the GLB (use Draco compression in Blender, or [gltf.report](https://gltf.report/)) |
| Doesn't work locally | Works after Jekyll builds — Liquid tags resolve on GitHub Pages |
