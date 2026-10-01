# 3D models, robots and CAD animation

The site has two 3D viewers (plus a PCB viewer, Part 3). Both download nothing until they scroll into view, and both respect reduced-motion settings.

| Viewer          | Use it for                                                                 | Data                               | Files                         |
| --------------- | -------------------------------------------------------------------------- | ---------------------------------- | ----------------------------- |
| `<ModelViewer>` | A CAD assembly (GLB): labeled parts, exploded views, folds, vehicle paths  | `src/data/models/<id>.yaml`        | `public/models/<id>/`         |
| `<RobotViewer>` | An articulated robot (URDF): sliders, poses, auto demos, explode, paths    | `src/data/robots/<id>.yaml`        | `public/robots/<id>/`         |
| `<PcbViewer>`   | A circuit board from its Gerbers: each layer on its own, 3D from STEP       | `src/data/pcbs/<id>.yaml`          | `public/pcbs/<id>/`           |

---

## Part 1 — CAD assemblies (`<ModelViewer>`)

### 1. Prepare the CAD (colors matter)

**Yes — color your CAD before exporting.** The exporter writes each part's *appearance* as its color. Anything you never colored comes out as SolidWorks' default pale lavender, which looks washed-out on the dark site. Before exporting:

- **Assign appearances to every visible part.** Match the real hardware where it makes sense (black PLA, magenta wheels…). Pick a few deliberate colors rather than many.
- **Avoid pure black (`#000`) and pure white.** They lose all shading. Use a dark graphite (≈ `#24272c`) and an off-white instead.
- **Prefer plain colors over textures.** Textured appearances like carbon fiber or brushed metal alias into noise at web resolution; a flat dark matte reads better.
- **Use matte-to-satin finishes for plastics.** The default plastic is very glossy, so pick a satin or low-gloss version.
- **Hide what nobody will see:** fasteners, internal wiring, PCB detail you don't need. It shrinks the file a lot.
- **Name components meaningfully** in the feature tree. Those names become the `part:` names used for labels.

Forgot? The **`appearance:`** section of the model's YAML can recolor parts without re-exporting (see step 4).

### 2. Export a GLB

- **SolidWorks:** *File → Save As → Extended Reality (`*.glb`)*. Tick *Export appearances*. Keep tessellation at medium; very fine output gets heavy.
- **Fusion 360:** export *OBJ* or *FBX*, open it in Blender, then *File → Export → glTF 2.0 (.glb)*.

Put the export anywhere; `_archive/cad-src/` is git-ignored and keeps it local.

### 3. Optimize and register

```bash
npm run model:optimize -- _archive/cad-src/kermit-v3.glb kermit-v3
npm run model:parts -- kermit-v3          # list the CAD part names
```

The optimizer simplifies, quantizes and meshopt-compresses the mesh, converts textures to WebP, and writes three files:

- `public/models/<id>/model.glb`, targeting ≤ 5 MB (ideally ≤ 3). If it's over budget, re-run with `--ratio 0.25`. For very dense exports (EEVi was 125 MB) also loosen the simplifier's error limit: `--ratio 0.08 --error 0.01`.
- `public/models/<id>/parts.json`, which records where every named part's surfaces are.
- `src/data/models/<id>.yaml`, the first time only. Later runs update only `sizeMB`.

### 4. Edit `src/data/models/<id>.yaml`

```yaml
src: /models/kermit-v3/model.glb
poster: /models/kermit-v3/poster.webp
alt: Kermit V3 quadcopter CAD assembly
sizeMB: 2.2
forward: +x                 # model axis the front faces (+x | -x | +z | -z)
cameraOrbit: 40deg 62deg 92%   # default view: azimuth, elevation, zoom (% of auto-fit)

hotspots:
  - id: lidar
    part: LD19_v2-1         # exact CAD part name (npm run model:parts)
    from: top               # top | bottom | front | back | left | right
    label: 360° LiDAR
    partNo: LDROBOT LD19
    detail: One or two sentences on what it does and why.

appearance:                 # baked in by model:optimize — re-run it after editing
  defaultColor: '#3c4046'   # replaces SolidWorks' unassigned lavender
  flattenTextures: '#1b1d21'  # textured materials (carbon fiber) → flat matte color
  parts:                    # per-part colors; `match` takes * wildcards; later rules win
    - { match: ['free_wheel-*', 'tread_gear-*'], color: '#d63a76', roughness: 0.55 }
```

**Labels by part name.** The marker lands on the outward surface of that part's `from` side. Parts hidden behind others still get a marker; it's dimmed until you orbit around to it. Selecting a part, on the model or in the list, flies the camera there.

**Labels by hand**, for a spot that isn't a whole part:
1. Run `npm run dev` and open the page with **`?author`**.
2. **Shift+click** the model. A YAML block with `position`, `normal` and the camera `orbit` is copied to your clipboard; paste it in place of `part`/`from`.

**Poster.** In `?author` mode, frame the view and press **Save poster**. Move the downloaded file to `public/models/<id>/poster.webp`. The poster shows instantly while the model loads, and it's what phones see until they tap "Load 3D model".

### 5. Show it

- In a write-up: `<ModelViewer id="kermit-v3" caption="…" />`
- As the page hero: `model: kermit-v3` under the project in `src/data/projects.yaml`

### 6. Motions: exploded views, folds, vehicle paths

Predefined motions are written in the model YAML and **baked into the GLB** as real animations. `<model-viewer>` can play animations but can't move parts on its own. Each motion becomes a button on the viewer:
- **Explode and fold** toggle out and back.
- **Paths** loop until pressed again.
- Hotspots hide while parts are moved.
- **Reset** puts everything back.

```yaml
motions:
  # Exploded view. mode: radial (away from the center) | axis (spread along one axis,
  # in order — stacks and cylinders) | planar (outward in the plane ⟂ axis, no vertical travel)
  - id: explode
    type: explode
    label: Exploded view
    mode: planar
    axis: +y
    distance: 1.6               # spread factor: 1 = parts move as far again as they are from the center
    fixed: ['*ExternalTank*']   # parts that stay put (* wildcards)
    stagger: 0.25               # outermost part starts first
    # anchor: min               # axis mode: the lowest part stays (min | center | max)
    # level: 2                  # explode the parts inside sub-assemblies instead
    # parts:                    # per-part overrides: direction + distance (fraction of model size)
    #   - { match: "Lid-1", direction: +y, distance: 0.4 }

  # Fold: named parts rotate about a hinge and/or slide (landing gear, folding arms, doors).
  - id: fold
    type: fold
    label: Fold arms
    seconds: 1.4
    stagger: 0.2
    joints:
      - { match: "CF_Arm-1", pivot: "0.08 -0.015 -0.06", axis: +y, angle: 70 }   # pivot: Shift+click in ?author mode
      - { match: "Leg-*", pivot: center, axis: +x, angle: -90 }
      - { match: "Antenna-1", translate: "0 0.03 0" }                            # slide, meters

  # Path: the whole vehicle flies or drives a loop; spinning parts are optional.
  - id: fly
    type: path
    label: Fly a figure 8
    shape: figure8        # figure8 | circle
    size: 3               # path width, × the model's size
    seconds: 10
    height: 0.5           # climb (× model size); takeoff: true lifts off and lands at the ends
    takeoff: true
    bank: 18              # lean into turns, degrees (0 for ground vehicles)
    spin: [{ match: "MAD_4006_EEE-*", axis: +y, rpm: 900 }]   # motors / props / wheels
    # autoplay: true      # start on its own when scrolled into view (never with reduced motion)
```

Then bake it:

```bash
npm run model:motions -- shuttle-model
```

This is fast: it re-bakes the published GLB in place and doesn't need the raw CAD file. `model:optimize` runs the same step, so motions survive a re-optimize. It also writes `public/models/<id>/motions.json`, which holds the durations and the camera framing used while a motion plays.

Two checks catch mistakes:
- If a motion in the YAML isn't baked, the build fails.
- `npm run lint:content` warns when a motion was edited since its last bake.

The vehicle moves along the model's `forward` axis, so check that it's set correctly.

Tested examples:
- **Live:** the Space Shuttle's exploded view.
- **Removed from the live pages, but tested:**
  - Kermit V3 figure 8. Paste the `fly` block above into kermit-v3.yaml.
  - Mr Toad circle: `{ id: drive, type: path, label: Drive around, shape: circle, size: 3, seconds: 9, spin: [{ match: ["free_wheel-*", "tread_gear-*"], axis: +z, rpm: -120 }] }`.

#### What each motion needs: GLB or URDF?

| Motion | GLB (`<ModelViewer>`) | URDF (`<RobotViewer>`) |
| --- | --- | --- |
| **Exploded view** | Works with a plain GLB. It needs the parts as separate nodes, which SolidWorks' GLB export gives you (one node per component). Sub-assemblies move as one unit unless you set `level: 2`. | Works. Each link's meshes move; the joints stay put. |
| **Fold / hinge** | Fine for independent hinges (a landing leg, a folding arm, a door). Give a pivot point and an axis. Parts inside a moving sub-assembly follow it. | Use poses plus a `sequence` motion. Best for chains (arm segments that carry each other), because the URDF already knows the joints and their limits. |
| **Driving / flying a path** | Works. Spinning props or wheels must be separate named parts. | Works. Wheel joints spin via `spin: [{ joint: … }]`. Use this when the vehicle also has articulated parts. |
| **Arbitrary keyframed motion** (steering plus suspension, a deploy sequence with timing) | Author it in CAD or Blender and export it with the GLB (below). | A `sequence` of poses. |

Rule of thumb: **a GLB is enough** for exploded views, single hinges and vehicle paths. **Use a URDF** when parts are linked in a chain (robot arms, legs, gimbals), or when visitors should drive the joints themselves with sliders.

#### Animations authored in CAD

`<ModelViewer>` also plays animations already stored in the GLB; `npm run model:parts` lists any it finds. To make them:

- **SolidWorks:** build a **Motion Study**, for example an exploded view (*Animation Wizard → Explode*) or arm-fold keyframes. Then *Save As → Extended Reality (`.glb`)* with *Export animations* ticked. Each motion study becomes a named animation.
- **Blender:** import the GLB, keyframe the named part objects, give each action a name, and export glTF with *Animation* enabled.

Then list them in the model YAML:

```yaml
animations:
  - { name: Fold, label: Fold arms }                    # a ▶ button; plays once
  - { name: Spin, label: Spin props, loop: true }       # loops until pressed again
  - { name: Explode, label: Exploded view, scrub: true } # tied to scroll position instead
```

`scrub: true` maps the animation's timeline to how far the viewer has scrolled through the screen. Scrolling down assembles or explodes the model.

---

## Part 2 — Robots from URDF (`<RobotViewer>`)

For anything with joints: arms, legged robots, gimbals, folding mechanisms.

### 1. Export a URDF

**SolidWorks:** install the [SolidWorks to URDF Exporter](http://wiki.ros.org/sw_urdf_exporter). Then:

1. Define links and joints (axes and limits) in the exporter.
2. *Export URDF and Meshes*. You get `<name>/urdf/<name>.urdf` and `<name>/meshes/*.STL`.

**Fusion 360:** use `fusion2urdf`.

Any exporter that writes a ROS package (URDF plus STL or DAE meshes) works.

### 2. Import it

```bash
npm run robot:import -- _archive/cad-src/dum_i_s_description dum-i
```

The importer reads the URDF, converts every mesh (STL or DAE) to a compressed GLB (DUM-I went from 11 MB to 0.5 MB), and writes:

- `public/robots/<id>/<id>.urdf`, with mesh paths rewritten to `meshes/<link>.glb`.
- `public/robots/<id>/meshes/*.glb`.
- `src/data/robots/<id>.yaml`, the first time only.

Colors come from `appearance` in the YAML (below), falling back to the URDF's material colors. Change a color and re-run the import. Use `--ratio 0.3` to simplify meshes further.

### 3. Edit `src/data/robots/<id>.yaml`

```yaml
urdf: /robots/dum-i/dum-i.urdf
alt: DUM-I robot arm
up: +z                               # URDFs are usually Z-up; +y if yours isn't
sliders: true                        # a slider for every movable joint (uses URDF limits)
poses:                               # radians (meters for prismatic joints)
  - { id: home, label: Home,  joints: { base_yaw: 0, shoulder: 0, elbow: 0 } }
  - { id: scan, label: Scan,  joints: { base_yaw: 0.8, shoulder: 0.6, elbow: 1.1 } }
  - { id: stow, label: Stow,  joints: { base_yaw: 0, shoulder: -0.4, elbow: 2.2 } }
forward: +x                          # the robot's front (ROS convention), for path motions
motions:                             # buttons above the poses; played live (nothing to bake)
  - { id: demo, type: sequence, label: Demo, poses: [home, scan, stow, home], seconds: 1.6, hold: 0.4, loop: true, autoplay: true }
  - { id: fold, type: sequence, label: Fold to stow, poses: [home, stow], loop: false }
  - { id: explode, type: explode, label: Exploded view, mode: axis, axis: +z, anchor: min, distance: 0.9 }  # URDF frame: +z is up
  # - { id: drive, type: path, label: Drive, shape: circle, spin: [{ joint: left_wheel_joint, rpm: 60 }] }
appearance:                          # baked in by robot:import
  default: '#9aa0a8'
  links: { base_plate_link: '#2c4fb8', gimbal_link: '#d63a76' }
```

Joint names must match the URDF. The sliders display them, so you can read them off the page.

### 4. Show it

`<RobotViewer id="dum-i" caption="…" />` in the write-up.

- Pose buttons ease the joints between configurations.
- Motion buttons play the `motions`: sequences, the exploded view (a toggle; the camera pulls back to fit it) and paths.
- The first motion with `autoplay: true` starts when the viewer scrolls into view. A slider, a pose or Reset stops it, and it never runs for visitors with reduced motion.

Explode and path math is shared with the GLB baker (`src/lib/motion.ts`), so the same settings behave the same way in both viewers.

`npm run lint:content` checks that every registered model and robot has its files, and that every `part:` name exists.

---

## Part 3 — Circuit boards (`<PcbViewer>`)

Shows a PCB from its fabrication files. One list, ordered like the physical stack-up, switches the view:
- the assembled top side;
- each layer on its own, from top silkscreen through the inner copper to bottom silkscreen, always drawn over the outline and holes;
- the assembled bottom side;
- an optional 3D board from the STEP model.

Visitors can step through the list with the arrow keys, drag to pan, and Ctrl + scroll (or pinch) to zoom.

### 1. Export

- **Gerbers:** Altium, KiCad or EasyEDA. Gerber X2 is best, because each file says which layer it is. Older exports are recognized by their extension (`.GTL`, `.GBL`, `.GTO`, `.GKO`…). Include the drill files.
- **STEP (optional):** the 3D board model, which becomes the 3D tab.

Put both in one folder, e.g. `_archive/cad-src/typhoon-pcb/`.

### 2. Import

```bash
npm run pcb:import -- _archive/cad-src/typhoon-pcb typhoon
```

This writes:

- `public/pcbs/<id>/top.svg` and `bottom.svg`, the rendered board faces.
- One SVG per layer, plus `manifest.json` (size, layer list, colors).
- From the STEP, if present, a GLB that goes through `model:optimize` as `<id>-board`. That gives `public/models/<id>-board/` and `src/data/models/<id>-board.yaml`.
- `src/data/pcbs/<id>.yaml`, the first time only:

```yaml
name: Typhoon gimbal controller
alt: Typhoon gimbal controller PCB, 45 × 30 mm, four copper layers
model: typhoon-board      # the 3D tab; remove to hide it
```

The import prints the layers it found. If one is missing, check that its file has a standard extension or X2 attributes.

### 3. Show it

`<PcbViewer id="typhoon" caption="…" />` in the write-up.

Layer colors come from `manifest.json`. To change one, edit `LAYER_COLORS` in `scripts/import-pcb.mjs` and re-import.

### Posters

A model shows its poster (`public/models/<id>/poster.webp`) until the 3D loads. To make one, open the page in `npm run dev` with `?author` on the URL, frame the view, and click "Save poster". Save the file into the model's folder.
