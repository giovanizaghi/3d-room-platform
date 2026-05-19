# RoomScene Architecture

## Overview

`apps/web/app/components/room-editor/RoomScene.tsx` is a single React component that owns the entire Three.js 3D room editor. It is a `"use client"` Next.js component. All Three.js setup, scene management, interaction logic, and external APIs live inside one large `useEffect` that runs only when `width` or `depth` change.

The component communicates with the parent page exclusively through:
- **Refs** — the parent passes in `useRef` handles that `RoomScene` populates with imperative functions (add object, delete, deselect, update light/material/transform, set camera preset).
- **Callbacks** — `onInspectorChange`, `onWallSelect`, `onCameraChange` notify the parent of state changes.

---

## File-level exports

| Export | Kind | Description |
|--------|------|-------------|
| `ObjectType` | type alias | `"cube" \| "sphere" \| "cylinder" \| "frame" \| "window" \| "door" \| "pointLight" \| "spotLight"` |
| `WallId` | type alias | `"front" \| "back" \| "left" \| "right"` |
| `ToolMode` | type alias | `"translate" \| "rotate"` |
| `CameraPreset` | type alias | `"perspective" \| "top" \| "front" \| "left" \| "right"` |
| `kelvinToHex(k)` | function | Converts Kelvin color temperature (1000–40000) to hex color string using the Tanner Helland algorithm |
| `LightProps` | interface | Serializable light state: type, intensity, distance, castShadow, colorTemp, angle?, penumbra? |
| `MaterialProps` | interface | Serializable material state: color (hex), roughness, metalness, opacity, transparent |
| `TransformData` | interface | Serializable transform: position {x,y,z} in metres, rotation {x,y,z} in degrees |
| `SelectionInfo` | interface | Unified selection descriptor: type, subType, material?, transform?, light? |
| `MaterialPreset` | interface | A named preset combining all MaterialProps fields |
| `MATERIAL_PRESETS` | const array | 8 named presets: Paint, Concrete, Brick, Wood, Marble, Metal, Glass, Ceramic |
| `RoomSceneProps` | interface | Full props contract for the component |
| `RoomScene` | React component | The editor itself |

---

## Props (`RoomSceneProps`)

```ts
width, depth          // Room plan dimensions in metres
tool                  // Active transform mode; change triggers applyToolRef
addObjectRef          // Ref populated with (type: ObjectType) => void
deleteSelectedRef     // Ref populated with () => void
deselectRef           // Ref populated with () => void (clears all selections)
setCameraPresetRef    // Ref populated with (preset: CameraPreset) => void
updateLightRef        // Ref populated with (props: Partial<LightProps>) => void
updateMaterialRef     // Ref populated with (props: Partial<MaterialProps>) => void
updateTransformRef    // Ref populated with (props: Partial<TransformData>) => void
onInspectorChange     // (info: SelectionInfo | null) => void
onWallSelect          // (wallId: WallId | null) => void   (kept for wall object panel gating)
onCameraChange        // (label: string) => void
```

The parent page holds all refs and calls them to drive the 3D scene imperatively. The component never exposes state through React state — the Three.js scene **is** the state.

---

## Internal constants

```
WALL_HEIGHT = 2.7 m
THICKNESS   = 0.15 m  (wall slab thickness)

PALETTE     — default hex color per ObjectType
HALF_H      — half-height per floor object type (for snap-to-surface)
WALL_OBJ_DEFS — {w, h, defaultY} per wall object type (frame, window, door)

FLOOR_TYPES  = Set { cube, sphere, cylinder }
WALL_TYPES   = Set { frame, window, door }
LIGHT_TYPES  = Set { pointLight, spotLight }
```

---

## Module-level helper functions (outside the component)

### `buildGeometry(type: ObjectType): THREE.BufferGeometry`
Returns a fresh buffer geometry for floor furniture types.

### `buildWallWithHoles(wallW, wallH, thickness, holes[]): THREE.BufferGeometry`
Builds an extruded wall geometry with rectangular cut-outs for windows/doors using `THREE.Shape` + `THREE.Path` holes + `THREE.ExtrudeGeometry`.

---

## `useEffect` structure

The entire Three.js lifecycle is one `useEffect([width, depth])`. Cleanup disposes everything and nulls all refs. The internal structure, in order:

```
1. Renderer setup         — WebGLRenderer, PCFSoftShadowMap, ACES tonemapping
2. Scene & camera         — PerspectiveCamera, dark blue background
3. Lighting               — HemisphereLight + AmbientLight (fill) + DirectionalLight (sun/shadows)
4. Room geometry          — floor slab, grid, 4 walls, invisible shadow ceiling
5. Wall mesh map          — WallMeshMap { front, back, left, right }
6. Wall wireframe helpers — attachWireframe / detachWireframe per WallId
7. setWallSelection()     — clears all other selections, attaches wall wireframe, broadcasts
8. wallInfo               — per-wall local axis info for wall-object placement
9. wallObjects[]          — list of meshes placed on walls
10. rebuildWall()         — regenerates wall geometry with holes, clones material, re-attaches wireframe
11. OrbitControls         — enablePan=false, dampingFactor=0.06, polar angle clamped
12. Camera presets        — 5 snaps, setCameraPresetRef, ceiling shadow toggle on top view
13. Furniture tracking    — furniture[], selected, selectedFloor, EMISSIVE_SEL/NONE
14. Inspector helpers     — readMaterial(), readTransform(), broadcastInspector() (50ms throttle)
15. Light proxy system    — LightEntry type, lightEntries[], selectedLight
    - buildPointHelper()  — wireframe sphere at light distance radius
    - buildSpotHelper()   — cone outline (rim circle + 4 edge lines + axis)
    - attachLightHelper() / detachLightHelper()
    - getLightProps()
16. snapToSurface()       — raycasts downward from WALL_HEIGHT+1; lands object on floor or stack
17. placeOnWall()         — positions a wall object on the inner face of a wall
18. syncWallLocal()       — stores mesh.userData.wallLocal (wall-relative X or Z)
19. TransformControls     — tc.getHelper(), size=1.2; axis visibility varies by object/wall type
20. tc "dragging-changed" — disables OrbitControls while dragging; sets justDragged flag
21. tc "objectChange"     — constrains wall objects to wall plane + Y clamp; snaps floor objects;
                            re-broadcasts transform to inspector (throttled)
22. Selection wireframe   — attachObjectWireframe() / detachObjectWireframe() (EdgesGeometry child)
23. setSelection()        — clears all others, emissive highlight + wireframe + TC attach + broadcast
24. setFloorSelection()   — clears all others, floor wireframe + broadcast
25. setLightSelection()   — clears all others, helper lines + proxy emissive + TC attach + broadcast
26. addObjectRef          — creates floor/wall/light meshes, sets up userData, calls setSelection
27. deselectRef           — calls all four set*Selection(null/false)
28. deleteSelectedRef     — removes light entry or furniture mesh from scene+arrays, broadcasts null
29. updateLightRef        — patches light props, sets Three.js light properties, rebuilds helper, broadcasts
30. updateMaterialRef     — patches MeshStandardMaterial on selected/floor/wall, broadcasts
31. updateTransformRef    — sets position/rotation on selected furniture, snaps or rebuilds wall, broadcasts
32. Click selection       — onPointerDown/onPointerUp with 6px drag threshold;
                            priority: furniture > walls > floor > empty (deselect)
33. Keyboard              — Escape clears all selections
34. updateWalls()         — Sims-style hide: uses colorWrite/depthWrite=false instead of visible=false
                            (Three.js skips shadow pass for visible=false objects);
                            auto-deselects objects on hidden walls
35. Animate loop          — rAF, controls.update(), updateWalls(), render()
36. ResizeObserver        — keeps renderer and camera aspect in sync
37. Cleanup               — cancelAnimationFrame, ro.disconnect, remove listeners, null all refs,
                            tc/controls/renderer dispose, remove domElement
```

---

## Selection system

There are four mutually exclusive selection states, each managed by a dedicated setter function. **Every setter clears the other three before activating itself.** This invariant is enforced separately in each setter.

| State variable | Setter | Visual feedback |
|---------------|--------|-----------------|
| `selected: THREE.Mesh \| null` | `setSelection()` | blue emissive highlight + orange EdgesGeometry wireframe child + TransformControls |
| `selectedWall: WallId \| null` | `setWallSelection()` | orange EdgesGeometry wireframe child on wall mesh |
| `selectedFloor: boolean` | `setFloorSelection()` | orange EdgesGeometry wireframe child on floor mesh |
| `selectedLight: LightEntry \| null` | `setLightSelection()` | yellow helper lines (sphere or cone) + brighter proxy emissive + TransformControls on proxy |

All setters call `broadcastInspector(SelectionInfo | null, force=true)` when selection changes.

---

## Light system

Each user-added light is a `LightEntry`:
```ts
type LightEntry = {
  proxy: THREE.Mesh;                           // OctahedronGeometry(0.12), clickable, TC target
  light: THREE.PointLight | THREE.SpotLight;   // parented to proxy
  helperLines: THREE.LineSegments | null;      // shown only when selected
};
```

- `proxy.userData` = `{ type, isLight: true }`
- `light.userData` = serialized `LightProps` (source of truth for inspector)
- Proxy mesh color = `kelvinToHex(colorTemp)` (Kelvin tint)
- SpotLight has a separate `target` object added to scene; its world position is updated in `objectChange` to always sit below the proxy

---

## Wall geometry (holes)

Walls with windows/doors are rebuilt on every change via `rebuildWall(wallId)`. The process:
1. Collect all `wallObjects` for that wall whose type is `window` or `door`.
2. Convert their `userData.wallLocal` (wall-relative coords) to `{cx, cy, w, h}` hole descriptors.
3. Call `buildWallWithHoles()` → `ExtrudeGeometry` with `Shape.holes`.
4. Replace old mesh in scene, clone old material to preserve user-applied colors.
5. Re-attach wireframe if that wall is selected.

Front/back walls span `width` (X). Left/right walls span `depth + THICKNESS*2` (Z), creating symmetric corner overlap so no gaps appear.

---

## Camera & shadow ceiling

The invisible shadow ceiling is a `PlaneGeometry` at `y = WALL_HEIGHT` with `colorWrite=false` and `depthWrite=false`. Because Three.js uses a separate depth material for the shadow pass, the geometry still occludes the sun directional light even though it is visually transparent.

The ceiling's `castShadow` is toggled off whenever the camera is in "Top" view to prevent the floor from being fully shadowed from above.

---

## Sims-style wall hide

When the camera crosses a wall's midplane, that wall is hidden by setting `mat.colorWrite = false` and `mat.depthWrite = false`. This keeps the wall in the shadow pass (unlike `visible = false` which Three.js skips entirely in shadow rendering). The hidden state is tracked in `mesh.userData.simHidden` for raycast filtering.

---

## Inspector broadcast (`broadcastInspector`)

To avoid flooding React with state updates during gizmo drags, updates are throttled to ~20fps (50ms minimum interval) unless `force=true`. Forced updates are used on any discrete selection change (click, escape, button press). Throttled updates are used in the `objectChange` event (continuous drag).

---

## Known design issues (for SOLID refactor)

1. **Single Responsibility violated**: One 1200-line `useEffect` handles renderer setup, geometry, lighting, camera, all selection logic, all APIs, event listeners, and animation. Each of these is a separate responsibility.

2. **All state is mutable closure variables**: `selected`, `selectedWall`, `selectedFloor`, `selectedLight`, `furniture[]`, `lightEntries[]`, `wallObjects[]`, `wallMeshes`, `currentTool` etc. are all plain `let`/`const` inside the effect closure. There is no encapsulation boundary.

3. **Selection setters duplicate the "clear others" logic**: Each of the four `set*Selection` functions contains a near-identical block that clears the other three. This is repeated four times.

4. **`addObjectRef.current` is a 60-line switch-like function**: It handles floor objects, wall objects, and lights in one imperative block. Each branch is a separate creation use-case.

5. **Wall object management is spread across multiple functions**: `placeOnWall`, `syncWallLocal`, `rebuildWall`, the TC `objectChange` handler, and `updateTransformRef` all share knowledge of the wall-object coordinate convention.

6. **`useEffect` depends on stale closures**: The entire Three.js world only rebuilds on `[width, depth]`. React props like `onInspectorChange` and all refs are captured once — changes to callbacks are silently ignored. This is intentional (for perf) but fragile.

7. **No separation between scene construction and interaction**: Building the room geometry and attaching pointer/keyboard listeners are interleaved in the same effect.

8. **`LightEntry` type is defined inside the effect**: It is not reusable or testable outside the component.

---

## Suggested refactor boundaries (for a SOLID agent)

| Module | Contents |
|--------|----------|
| `sceneSetup.ts` | Renderer, scene, camera, lighting, ResizeObserver |
| `roomGeometry.ts` | Floor, grid, wall construction, `buildWallWithHoles`, `rebuildWall` |
| `selectionManager.ts` | `SelectionState` class/object with `selectMesh / selectWall / selectFloor / selectLight / clear` methods; owns all visual feedback (wireframe, emissive, TC attach) |
| `lightManager.ts` | `LightEntry` type, `addLight`, `removeLight`, `updateLight`, helper line builders |
| `furnitureManager.ts` | `addFloorObject`, `addWallObject`, `snapToSurface`, `placeOnWall`, `syncWallLocal` |
| `cameraManager.ts` | Presets, `detectCameraLabel`, ceiling shadow toggle, OrbitControls config |
| `inspectorBridge.ts` | `readMaterial`, `readTransform`, `broadcastInspector` (throttle) |
| `RoomScene.tsx` | Thin orchestrator: creates managers, wires up refs and callbacks, runs animate loop, handles cleanup |
