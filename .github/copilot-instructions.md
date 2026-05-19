# GitHub Copilot Architecture Instructions
## 3D Room Editor — Engineering Governance Document

This file is the authoritative architectural governance document for AI-assisted coding on the 3D Room Editor module. It enforces boundary rules, lifecycle contracts, ownership invariants, and scalability constraints established during the SOLID refactoring of the monolithic `RoomScene.tsx`.

**Read this document completely before generating any code related to the editor.**

---

## 1. Architecture Philosophy

This editor is intentionally designed to resemble a small game engine embedded inside a React application. The design philosophy draws from:

- **Figma**: modular canvas manager + thin React shell
- **The Sims Build Mode**: deterministic wall/object logic with Sims-style occlusion
- **Game engine ECS**: each subsystem owns exactly one domain
- **Domain-Driven Design**: domain types and constants are pure; managers are the behavior layer

The core principle is **strict separation between Three.js runtime and React UI state**. React observes editor state through serialized DTOs (Data Transfer Objects). React never owns or mutates Three.js objects directly.

The architecture is designed to remain forward-compatible with:
- Undo/redo (command pattern over manager APIs)
- Multiplayer (state diffing over serialized SelectionInfo)
- AI-assisted layout (EditorEngine as a programmatic API surface)
- Plugin systems (manager injection via EditorEngine constructor)
- ECS migration (managers become system functions; entities replace Mesh instances)
- Server-side rendering export (scene serialization independent of Three.js)

---

## 2. Core Principles

1. **Single responsibility** — every file and class has exactly one job.
2. **Explicit ownership** — every Three.js object has exactly one owner; no shared mutation.
3. **One-directional data flow** — Three.js → InspectorBridge → React. Never React → Three.js directly.
4. **Deterministic lifecycle** — every object created is explicitly disposed; no implicit cleanup.
5. **Composition over inheritance** — managers collaborate through constructor injection; no class hierarchies.
6. **DTOs at the boundary** — `SelectionInfo`, `LightProps`, `MaterialProps`, `TransformData` are the only types that cross the Three.js/React boundary.
7. **Stable identifiers** — future code should prefer stable string IDs over direct mesh references across system boundaries.

---

## 3. File Ownership Map

This map is normative. When adding new logic, place it in the correct file. Never create a new file without identifying which layer it belongs to.

```
room-editor/
│
├── RoomScene.tsx              ← React shell only. No Three.js. No logic.
│
├── core/
│   └── EditorEngine.ts        ← Bootstraps all managers. Exposes public API to React.
│
├── scene/
│   ├── SceneFactory.ts        ← Creates renderer, scene, camera. No logic beyond setup.
│   ├── LightingFactory.ts     ← Creates ambient/directional scene lighting.
│   └── RoomFactory.ts         ← Creates room geometry (floor, walls, ceiling, grid).
│
├── managers/
│   ├── CameraManager.ts       ← OrbitControls lifecycle, presets, ceiling occlusion.
│   ├── SelectionManager.ts    ← SINGLE SOURCE OF TRUTH for selection state.
│   ├── TransformManager.ts    ← TransformControls lifecycle and axis constraints.
│   ├── FurnitureManager.ts    ← Floor object (cube/sphere/cylinder) lifecycle.
│   ├── WallObjectManager.ts   ← Wall objects, hole geometry, Sims-hide visibility.
│   ├── LightManager.ts        ← Point/spot lights, proxy meshes, helper lifecycle.
│   ├── MaterialManager.ts     ← Material patch operations on selected surfaces.
│   ├── InspectorBridge.ts     ← Serializes Three.js state → SelectionInfo DTOs.
│   ├── EventManager.ts        ← ALL pointer and keyboard event handling.
│   └── RenderLoop.ts          ← requestAnimationFrame lifecycle and ResizeObserver.
│
├── domain/
│   ├── types.ts               ← All TypeScript interfaces and union types.
│   └── constants.ts           ← All numeric constants, palettes, presets.
│
└── utils/
    ├── kelvinToHex.ts         ← Pure function. No imports from this project.
    ├── disposeThree.ts        ← Recursive Three.js geometry/material disposal.
    └── throttle.ts            ← Generic throttle utility.
```

---

## 4. Dependency Direction Rules

Dependencies flow in exactly one direction. Violations will cause circular imports and architectural degradation.

```
React UI (page.tsx, Inspector.tsx)
    ↓  (reads DTOs only)
EditorEngine (public API surface)
    ↓  (creates and owns)
Managers (SelectionManager, LightManager, etc.)
    ↓  (use)
Scene Factories (SceneFactory, RoomFactory, etc.)
    ↓  (use)
Domain (types.ts, constants.ts)
    ↓  (use)
Utils (kelvinToHex, disposeThree, throttle)
```

**Allowed imports:**
- Managers may import from `domain/`, `utils/`, and other managers (constructor injection only, no circular deps).
- Factories import from `domain/` and `utils/` only.
- `EditorEngine` imports all managers and factories.
- `RoomScene.tsx` imports only from `core/EditorEngine` and re-exports from `domain/`.

**Forbidden imports:**
- Domain files must never import from managers, factories, or React.
- Utils must never import from any local project file.
- Factories must never import from managers.
- React components must never import from `scene/` or `managers/` directly.
- `RoomScene.tsx` must never import from `three` directly.

---

## 5. RoomScene.tsx — Strict Shell Contract

`RoomScene.tsx` must remain a thin React shell with no Three.js knowledge.

**Allowed in RoomScene.tsx:**
- `useRef`, `useEffect`
- Creating one `EditorEngine` instance inside `useEffect`
- Wiring imperative refs to engine method calls
- Returning a single `<div ref={containerRef} className="w-full h-full" />`
- Re-exporting domain types and constants for external consumers

**Forbidden in RoomScene.tsx:**
- Any `import * as THREE from "three"`
- Any `import { OrbitControls }` or `import { TransformControls }`
- Any Three.js object instantiation
- Any scene graph mutation
- Any selection logic
- Any geometry or material construction
- Any event listener registration
- Any `requestAnimationFrame` call

If logic does not fit within the above "Allowed" list, it belongs in `EditorEngine` or a manager.

---

## 6. EditorEngine — Orchestrator Contract

`EditorEngine` is the single bootstrap point and the only class that instantiates managers. It exposes a clean, imperative public API to React via refs.

**EditorEngine public API surface (methods callable from React):**
```typescript
addObject(type: ObjectType): void
deleteSelected(): void
clearSelection(): void
setCameraPreset(preset: CameraPreset): void
setTool(mode: ToolMode): void
updateLight(props: Partial<LightProps>): void
updateMaterial(props: Partial<MaterialProps>): void
updateTransform(props: Partial<TransformData>): void
dispose(): void
```

**Rules:**
- EditorEngine is created inside `useEffect` and destroyed on cleanup. Never instantiate it outside an effect.
- EditorEngine is **not** a singleton. A fresh instance is created for each mounted `RoomScene`.
- All cross-manager callbacks (e.g. `setLightCleanupCallback`) must be wired **after** all managers are constructed to avoid circular constructor dependencies.
- EditorEngine must call `dispose()` on all managers and the renderer during its own `dispose()`.
- EditorEngine must never store React state or call `setState`.

---

## 7. State Management Rules

There are two completely separate state layers in this application:

### Three.js Runtime State (owned by managers)
- Scene graph objects (`THREE.Mesh`, `THREE.Light`, etc.)
- Selection state (`SelectionManager.selection`)
- Camera position (`OrbitControls`)
- Transform gizmo state
- Helper visibility

**Rule:** Three.js runtime state is NOT application state. It cannot be stored in React `useState`. It cannot be serialized directly. It must be accessed only through manager APIs.

### React UI State (owned by React components)
- `selectionInfo: SelectionInfo | null` — the serialized DTO from `InspectorBridge`
- `tool: ToolMode` — current active tool
- `cameraLabel: string` — derived display label
- Inspector window position (`pos` in `Inspector.tsx`)
- UI panel open/closed state

**Rules:**
- React state must only contain plain serializable values.
- Never store `THREE.Mesh`, `THREE.Material`, `LightEntry`, or any Three.js object in React state.
- `setSelectionInfo` is the ONLY way React learns about selection changes. It is always called through `InspectorBridge.broadcast()`.
- The `Inspector` component must remain mounted at all times (not conditionally rendered based on selection) to preserve its internal position state.

---

## 8. Selection System Rules

`SelectionManager` is the **single source of truth** for the current selection. No other class or component may track or mutate selection state.

### Selection invariants:
- Only ONE selection may exist at a time. Selecting anything calls `clearAll()` first.
- `clearAll()` must always broadcast `null` through `InspectorBridge`.
- `clearAll()` must always fire the `lightCleanupCallback` when a light is deselected.
- After any wall rebuild (`WallObjectManager.rebuildWall`), `refreshWallWireframe()` must be called to sync the wireframe reference.

### Selection flow (correct):
```
user clicks mesh
  → EventManager.onPointerUp()
    → SelectionManager.selectObject(mesh)  // or selectWall / selectFloor / selectLight
      → clears previous selection
      → sets this.current
      → attaches wireframe/emissive
      → calls InspectorBridge.broadcast(dto, force=true)
        → React setState(selectionInfo)
          → Inspector re-renders with new DTO
```

### Forbidden selection patterns:
```typescript
// ❌ Never set selection state in React
const [selected, setSelected] = useState<THREE.Mesh | null>(null);

// ❌ Never call selectObject from outside EventManager or EditorEngine
mesh.addEventListener("click", () => selectionManager.selectObject(mesh));

// ❌ Never access selection state from a factory
const sel = selectionManager.current; // inside SceneFactory

// ❌ Never store the raw mesh in a React ref for selection tracking
const selectedMeshRef = useRef<THREE.Mesh | null>(null);
```

---

## 9. InspectorBridge — Serialization Contract

`InspectorBridge` is the only module that converts Three.js state into React-compatible DTOs. All inspector data passes through it.

**What InspectorBridge does:**
- `readMaterial(mesh)` → `MaterialProps` — extracts color/roughness/metalness/opacity
- `readTransform(mesh)` → `TransformData` — extracts position (metres) and rotation (degrees)
- `broadcast(info, force?)` — throttled callback that calls React's `onInspectorChange`

**Rules:**
- Serialization of any Three.js property into a DTO must live in `InspectorBridge` (or be called from it).
- The `broadcast()` throttle (50ms default) prevents flooding React during drag. Pass `force=true` on initial selection, explicit updates, and deletions.
- `LightManager` is responsible for broadcasting light inspector state (it owns the LightProps). It must call `inspector.broadcast()` directly when updating a light.
- `SelectionManager` is responsible for broadcasting all non-light selection DTOs.
- No component or manager other than `InspectorBridge` may call `onInspectorChange`.

**DTO rules:**
- DTOs (`SelectionInfo`, `LightProps`, `MaterialProps`, `TransformData`) are defined in `domain/types.ts`.
- DTOs are plain objects with primitive values only. No Three.js types.
- DTOs are immutable from React's perspective — never mutate a DTO; always create a new one.
- DTOs must contain enough information to fully render the Inspector UI without requiring any Three.js lookup.

---

## 10. Manager Responsibility Boundaries

Each manager owns exactly one domain. When a new feature is needed, identify which manager owns it. If none do, evaluate whether a new manager is justified or whether `EditorEngine` needs to coordinate.

| Manager | Owns | Must NOT do |
|---|---|---|
| `CameraManager` | OrbitControls, presets, ceiling shadow toggle | Touch selection, lights, or geometry |
| `SelectionManager` | Selection state, wireframes, emissive highlights, TC attach/detach | Create geometry, modify materials beyond highlight |
| `TransformManager` | TransformControls instance, axis constraints, drag detection | Create or destroy objects, touch selection state directly |
| `FurnitureManager` | Floor object mesh lifecycle, snap-to-surface | Wall objects, lights, selection |
| `WallObjectManager` | Wall object lifecycle, hole geometry, Sims-style wall hide | Floor objects, lights, selection |
| `LightManager` | Light proxy + real light lifecycle, helper build/attach/detach | Selection state, wall geometry |
| `MaterialManager` | Material property patching on current selection | Selection changes, geometry, lights |
| `InspectorBridge` | Three.js → DTO serialization, throttled broadcast | Scene mutations, selection changes |
| `EventManager` | All pointer/keyboard event listeners | Scene mutations, direct light/geometry creation |
| `RenderLoop` | `requestAnimationFrame`, `ResizeObserver`, `renderer.render()` | Scene mutations, selection logic |

---

## 11. Three.js Lifecycle Rules

Every Three.js object must follow this lifecycle:

### Creation
- Objects are created by their owning manager or factory.
- All created geometries and materials must be tracked for disposal.
- `castShadow` and `receiveShadow` must be set explicitly on every mesh.

### Mutation
- Geometry mutations (wall rebuilds) must replace the old mesh entirely — never mutate geometry in place.
- After replacing a mesh, update all references: `wallMeshes[wallId] = newMesh`, then call `refreshWallWireframe`.

### Disposal
- `geometry.dispose()` must be called on every geometry when its mesh is removed.
- `material.dispose()` (or per-item for arrays) must be called on every material.
- `disposeObject(scene)` from `utils/disposeThree.ts` provides recursive disposal of the full scene graph — call it in `EditorEngine.dispose()`.
- Helper `LineSegments` must have both `geometry.dispose()` and `(material as Material).dispose()` called.
- `TransformControls.dispose()` must be called in `TransformManager.dispose()`.
- `OrbitControls.dispose()` must be called in `CameraManager.dispose()`.
- `renderer.domElement.remove()` and `renderer.dispose()` must be called in `EditorEngine.dispose()`.
- `ResizeObserver.disconnect()` must be called in `RenderLoop.dispose()`.
- All DOM event listeners registered in `EventManager` must be removed in `EventManager.dispose()`.

### Anti-patterns:
```typescript
// ❌ Geometry mutation in place — always replace
wall.geometry = new THREE.BoxGeometry(...);

// ❌ Missing disposal on removal
scene.remove(mesh); // geometry and material leak

// ❌ Detaching but not disposing helpers
proxy.remove(helperLines); // geometry leak — must also call dispose()

// ❌ Re-attaching a helper without detaching the previous one
proxy.add(newHelper); // accumulates infinitely — always detach first
```

---

## 12. Light System Rules

The light system has two layers:
- **Proxy mesh** (`THREE.Mesh` with `OctahedronGeometry`) — the clickable, selectable, draggable handle
- **Real light** (`THREE.PointLight` or `THREE.SpotLight`) — child of the proxy mesh
- **Helper** (`THREE.LineSegments`) — also child of the proxy; visualises the light radius/cone

**Invariants:**
- `LightManager` owns creation, update, and removal of all three layers.
- `LightManager.attachHelper()` must always call `detachHelper()` first to prevent duplication.
- `LightManager.detachHelper()` must dispose both `geometry` and `material` of the helper.
- When `SelectionManager.clearAll()` deselects a light, it fires `lightCleanupCallback` which calls `LightManager.detachHelper()`.
- `LightManager.remove(entry)` must: detach helper → remove spotlight target → remove proxy from scene → remove from `furniture.items` → remove from `entries`.
- The proxy mesh must be added to `FurnitureManager.items` so it participates in raycasting.

**Forbidden:**
```typescript
// ❌ Creating a Three.js light outside LightManager
const pl = new THREE.PointLight();
scene.add(pl);

// ❌ Attaching a helper without detaching the previous one
entry.proxy.add(buildHelper()); // always call detachHelper() first

// ❌ Bypassing selectLight for inspector broadcast
selectionManager.selectLight(entry, props); // correct — props must be passed for immediate broadcast
```

---

## 13. Wall System Rules

Walls use Sims-style occlusion: walls facing the camera become transparent via `colorWrite`/`depthWrite` toggles. Wall objects (frames, windows, doors) create holes in the wall geometry via `THREE.ExtrudeGeometry` with `Shape.holes`.

**Invariants:**
- `WallObjectManager` owns all wall-related state: `wallMeshes`, `wallObjects`, wall info, hole rebuilding.
- `WallObjectManager.rebuildWall(wallId)` is the ONLY function that regenerates wall geometry with holes.
- After `rebuildWall`, the old mesh is removed from the scene and a new one is added. All references to the old mesh (including selection wireframes) become stale and must be refreshed.
- `SelectionManager.refreshWallWireframe(wallId, newMesh)` must be called immediately after every `rebuildWall`.
- `updateWallVisibility(cameraX, cameraZ)` is called every frame from `RenderLoop` to toggle wall occlusion.
- When a wall is hidden by Sims-occlusion, if that wall or one of its objects is selected, `SelectionManager.clearAll()` must be called.

**Forbidden:**
```typescript
// ❌ Rebuilding wall geometry outside WallObjectManager
const geo = buildWallWithHoles(...);
wallMeshes["front"].geometry = geo; // wrong — must go through rebuildWall()

// ❌ Placing wall objects outside WallObjectManager
const mesh = new THREE.Mesh(...);
mesh.position.set(...); // must use WallObjectManager.createWallObject()

// ❌ Constraining wall object positions outside TransformManager → WallObjectManager chain
mesh.position.z = someValue; // must go through constrainToWall()
```

---

## 14. Transform Controls Rules

There is exactly ONE `TransformControls` instance per editor session. It is created by `EditorEngine` and passed to both `SelectionManager` (for attach/detach) and `TransformManager` (for mode/axis control and event handling).

**Rules:**
- `TransformControls` must only be created in `EditorEngine`. Never instantiate it in any other file.
- `TransformManager` receives the TC instance via constructor injection.
- Axis constraints (`showX`, `showY`, `showZ`) must be set through `TransformManager.applyAxisConstraints()`.
- `TransformManager.wasJustDragged` (async flag) is the canonical way to suppress click events after a drag.
- The `dragging-changed` event handler must enable/disable `OrbitControls` via `CameraManager.setEnabled()`.
- The `objectChange` event handler must call `WallObjectManager.constrainToWall()` or `FurnitureManager.snapToSurface()` as appropriate.
- `TransformControls.dispose()` must be called in `TransformManager.dispose()`.

**Forbidden:**
```typescript
// ❌ Creating TransformControls outside EditorEngine
const tc = new TransformControls(camera, renderer.domElement); // inside a manager

// ❌ Calling tc.attach() outside SelectionManager
tc.attach(mesh); // inside EventManager or a component

// ❌ Setting showX/showY/showZ outside TransformManager
tc.showY = false; // inside EventManager
```

---

## 15. Event Handling Rules

`EventManager` owns all DOM interaction. It is the only class that registers event listeners on the renderer's `domElement` or on `window`.

**Owned by EventManager:**
- `pointerdown` / `pointerup` on canvas
- `keydown` on `window` (e.g. Escape to deselect)
- Drag threshold detection (6px hysteresis)
- Raycasting and hit priority dispatch

**Hit priority order (must be maintained):**
1. Furniture and light proxies (`FurnitureManager.getVisibleItems()`)
2. Visible walls (`WallObjectManager.getVisibleWalls()`)
3. Floor
4. Empty — calls `SelectionManager.clearAll()`

**Rules:**
- Every listener added in the constructor must be removed in `dispose()`.
- `EventManager` dispatches to manager APIs only — it never modifies scene objects directly.
- `EventManager` must check `TransformManager.wasJustDragged` before processing a click.
- There must be no duplicate listeners. Never call `addEventListener` twice for the same handler.

**Forbidden:**
```typescript
// ❌ Adding event listeners in RoomScene.tsx
containerRef.current.addEventListener("click", handler);

// ❌ Adding event listeners in SelectionManager
this.tc.domElement.addEventListener("pointerup", ...);

// ❌ Raycasting outside EventManager
const hits = raycaster.intersectObjects(...); // inside a component
```

---

## 16. Render Loop Rules

There is exactly ONE `requestAnimationFrame` loop per editor session, managed exclusively by `RenderLoop`.

**RenderLoop responsibilities:**
- Start/stop the rAF loop
- Call `CameraManager.update()` (which calls `OrbitControls.update()`) every frame
- Call `WallObjectManager.updateWallVisibility(camX, camZ)` every frame
- Call `renderer.render(scene, camera)` every frame
- `ResizeObserver` on the container to update camera aspect and renderer size

**Rules:**
- `RenderLoop.start()` must only be called once (it guards against double-start).
- `RenderLoop.dispose()` calls `stop()` + `resizeObs.disconnect()`.
- No other module may call `requestAnimationFrame` or `renderer.render()`.
- Per-frame logic added in the future must go into `RenderLoop`, delegating to the appropriate manager.

**Forbidden:**
```typescript
// ❌ Second render loop anywhere
useEffect(() => {
  function animate() { renderer.render(scene, camera); requestAnimationFrame(animate); }
  animate();
}, []);

// ❌ Calling renderer.render() from a manager
this.renderer.render(this.scene, this.camera); // inside TransformManager
```

---

## 17. React Boundaries

React components in this application are UI-only. They observe editor state but never create or mutate it.

### Allowed in React components:
- Reading `SelectionInfo` DTOs to render inspector UI
- Calling imperative ref functions (`addObjectRef.current?.(type)`)
- Managing pure UI state: tool mode, panel open/close, camera label display
- Dragging the Inspector window (pure CSS position state)
- Rendering icons, labels, buttons

### Forbidden in React components:
```typescript
// ❌ Accessing Three.js objects
import * as THREE from "three";
const mesh = new THREE.Mesh();

// ❌ Storing Three.js objects in state or refs
const meshRef = useRef<THREE.Mesh | null>(null);
const [light, setLight] = useState<THREE.PointLight | null>(null);

// ❌ Calling scene.add() from a component
scene.add(newMesh);

// ❌ Reading raw material values instead of DTOs
const color = mesh.material.color.getHexString();

// ❌ Calling selectionManager directly from a component
selectionManager.selectObject(mesh);

// ❌ Creating a renderer in a component
const renderer = new THREE.WebGLRenderer();
```

---

## 18. Camera System Rules

`CameraManager` wraps `OrbitControls` and provides a preset-based API to `EditorEngine`.

**Rules:**
- `OrbitControls` is created and owned by `CameraManager`. It is never accessed directly from outside.
- `CameraManager.setEnabled(false)` must be called when TransformControls starts dragging.
- `CameraManager.setEnabled(true)` must be called when TransformControls finishes dragging.
- The ceiling shadow mesh visibility is toggled when switching to/from the Top preset.
- Camera presets animate the camera to fixed positions; the `onCameraChange` callback notifies React of the new label.
- Camera position is checked every frame in `RenderLoop` to drive wall occlusion via `WallObjectManager.updateWallVisibility`.

---

## 19. Material System Rules

`MaterialManager` patches `THREE.MeshStandardMaterial` properties on the currently selected target.

**Rules:**
- `MaterialManager.update(props)` reads the current selection from `SelectionManager` and applies changes.
- Material changes call `mat.needsUpdate = true` after patching.
- After patching, `SelectionManager.broadcastCurrent(true)` must be called to sync the inspector.
- `MaterialManager` must never create new materials — it only patches existing ones.
- Floor and wall materials are shared within their mesh. Cloning a material (e.g. for wall rebuilds in `WallObjectManager`) is the responsibility of the caller.

---

## 20. Serialization and DTO Rules

DTOs are the data contract between Three.js and React. They must be:

- **Complete** — contain all data needed to render the inspector without further Three.js lookups
- **Primitive** — only numbers, strings, booleans, and plain nested objects
- **Immutable** — React must never mutate a DTO; always pass fresh objects
- **Typed** — defined in `domain/types.ts`; never use `any` or untyped objects

**Rotation serialization:** Always serialize all 3 rotation axes (X, Y, Z) even when only one is interactable. The inspector UI decides which axes to expose. Constraint logic belongs in `TransformManager`, not in serialization.

**Type discriminant:** `SelectionInfo.type` is the discriminant. Match on it exhaustively when consuming in React:
```typescript
switch (info.type) {
  case "floor": ...
  case "wall": ...
  case "furniture": ...
  case "light": ...
}
```

---

## 21. Performance Rules

- `InspectorBridge` throttles broadcasts to ~20fps (50ms minimum interval). Pass `force=true` only on initial selection, explicit commands, and deletions.
- `RenderLoop` calls `controls.update()` every frame only (no redundant calls from event handlers).
- Raycasting targets must be pre-filtered: only visible items are included in intersection tests.
- `buildWallWithHoles` uses `ExtrudeGeometry`. Call it only when a wall object is moved, added, or removed — not every frame.
- `EdgesGeometry` for wireframes should be computed once on selection, not every frame.
- Geometries used for helpers (wireframe sphere, cone outline) must be disposed when the helper is removed.
- `shadow.mapSize` should be set at creation time only; changing it at runtime is expensive.

---

## 22. Anti-Patterns — Forbidden at All Times

These patterns have been explicitly identified as causes of regressions, memory leaks, and architectural degradation. Copilot must never generate them.

### God Class / Monolith
```typescript
// ❌ All editor logic in one file
export function RoomScene() {
  useEffect(() => {
    // 1200 lines of Three.js here
  });
}
```

### Scene Mutations from React
```typescript
// ❌
function MyComponent() {
  const scene = useContext(SceneContext);
  useEffect(() => { scene.add(new THREE.Mesh(...)); }, []);
}
```

### Duplicated Render Loops
```typescript
// ❌ Second rAF anywhere in the codebase
requestAnimationFrame(function loop() {
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
});
```

### Duplicated Event Listeners
```typescript
// ❌ Adding the same handler twice
canvas.addEventListener("pointerup", this.onPointerUp);
canvas.addEventListener("pointerup", this.onPointerUp); // duplicate
```

### Stale Mesh References After Wall Rebuild
```typescript
// ❌ Holding old wall mesh reference after rebuildWall()
const wallRef = wallMeshes["front"]; // captured before rebuild
// ... rebuildWall("front") ...
scene.remove(wallRef); // now stale — already removed by rebuildWall
```

### Helper Accumulation
```typescript
// ❌ Attaching a new helper without detaching the previous one
entry.proxy.add(this.buildPointHelper(distance)); // grows infinitely
```

### Raw Three.js Objects in React State
```typescript
// ❌
const [selectedMesh, setSelectedMesh] = useState<THREE.Mesh | null>(null);
```

### Business Logic in React Components
```typescript
// ❌ Selection logic in a button handler
<button onClick={() => {
  const hits = raycaster.intersectObjects(scene.children);
  if (hits.length > 0) selectionManager.selectObject(hits[0].object as THREE.Mesh);
}} />
```

### Giant Switch on Type
```typescript
// ❌ Type-switching to call different managers in one place
switch (objectType) {
  case "cube": furnitureManager.create(...); break;
  case "window": wallObjectManager.createWallObject(...); break;
  // ... 10 more cases
}
// This belongs in EditorEngine.addObject(), which already handles this correctly.
```

### Missing Disposal
```typescript
// ❌ Removing a mesh without disposal
scene.remove(mesh); // geometry + material leak
// ✅ Correct:
mesh.geometry.dispose();
(mesh.material as THREE.Material).dispose();
scene.remove(mesh);
```

---

## 23. Correct Patterns — Examples to Follow

### Adding a new object type
1. Add its literal to `ObjectType` in `domain/types.ts`
2. Add its palette color to `PALETTE` in `domain/constants.ts`
3. Add its geometry to `buildGeometry()` in `scene/RoomFactory.ts` OR to the relevant manager's factory method
4. Classify it in `FLOOR_TYPES`, `WALL_TYPES`, or `LIGHT_TYPES` in `domain/constants.ts`
5. `EditorEngine.addObject()` routes it to the correct manager automatically

### Adding a new inspector field
1. Add the field to the relevant DTO interface in `domain/types.ts`
2. Serialize it in `InspectorBridge.readMaterial()` or `readTransform()`, or in the appropriate `broadcast()` call
3. Read and render it in `Inspector.tsx` (DTO only — no Three.js lookups)
4. Wire the update through the appropriate `update*Ref`

### Adding a new event (e.g. double-click to rename)
1. Add the listener in `EventManager` constructor
2. Remove it in `EventManager.dispose()`
3. Call a manager method or `EditorEngine` method from the handler — never mutate scene directly

### Adding a new manager
1. Create the file in `managers/`
2. Instantiate it in `EditorEngine` constructor after its dependencies
3. Call `dispose()` in `EditorEngine.dispose()`
4. Wire any cross-manager callbacks after all managers are constructed

---

## 24. Future-Proofing Rules

These rules protect the architecture's forward compatibility:

- **Undo/redo:** All mutations to editor state flow through manager APIs. When undo/redo is added, wrap manager calls in a command pattern. Never call `scene.add()` or `scene.remove()` directly from ad hoc code.
- **Serialization:** `SelectionInfo`, `LightProps`, `MaterialProps`, `TransformData` are already serialization-ready. Scene export will read from these DTOs, not from raw mesh properties.
- **Multiplayer:** State changes broadcast through `InspectorBridge` are already structured as events. Multiplayer can intercept this channel.
- **AI layout generation:** `EditorEngine.addObject()`, `EditorEngine.updateTransform()`, etc. form a clean programmatic API. AI-generated layout scripts will call these methods directly.
- **ECS migration:** Each manager maps directly to an ECS system. `FurnitureManager` → furniture system, `LightManager` → light system. Migration is achievable by replacing manager internal state with ECS queries.
- **Avoid Three.js version lock:** Never use deprecated Three.js APIs. Always check Three.js migration guides when upgrading.

---

## 25. AI Coding Expectations

When GitHub Copilot generates code for this project, it must:

1. **Always identify the correct file** before writing any code. Ask: which manager owns this? Which layer does this belong to?
2. **Never add Three.js logic to React components** or to `RoomScene.tsx`.
3. **Always call `dispose()`** when removing geometries, materials, helpers, or controls.
4. **Always detach helpers before attaching new ones** in `LightManager`.
5. **Always call `SelectionManager.clearAll()` before setting new selection** — never mutate `current` directly.
6. **Always broadcast through `InspectorBridge`** — never call `onInspectorChange` directly.
7. **Always pass `force=true` to `broadcast()`** on initial selection, explicit commands, and after deletions.
8. **Always serialize all 3 rotation axes** in `readTransform()` — never suppress axes at the serialization layer.
9. **Never create a second `requestAnimationFrame` loop** — add per-frame logic inside `RenderLoop.tick()`.
10. **Never add a DOM event listener outside `EventManager`** — if a new interaction is needed, add it there.
11. **Never store `THREE.Mesh` or any Three.js object in React `useState` or `useRef` for editor logic**.
12. **Always remove event listeners** added in a constructor from the corresponding `dispose()` method.
13. **Always check for stale references** after wall rebuilds — the old `THREE.Mesh` is removed from scene.
14. **Always add cross-manager callbacks** in `EditorEngine` after all managers are constructed.
15. **Always extend `domain/types.ts`** when adding new domain types — never define them inline in manager files.

When in doubt about where logic belongs, consult the ownership map in Section 3 and the dependency direction rules in Section 4.

---

## 26. Scalability Rules

As the editor grows:

- New object categories must follow the same classification pattern (`FLOOR_TYPES`, `WALL_TYPES`, `LIGHT_TYPES`) and be routed through `EditorEngine.addObject()`.
- New inspector sections must be new DTO fields in `SelectionInfo` — never raw Three.js properties.
- New selection types must be new variants in the `Selection` union type and handled exhaustively in `SelectionManager.clearAll()` and `SelectionManager.broadcastCurrent()`.
- New per-frame logic must be added as a method call in `RenderLoop.tick()`.
- New cross-system interactions must be wired through constructor injection or post-construction callbacks in `EditorEngine` — never through global state.
- New managers should be created when a responsibility cannot fit cleanly into any existing manager. A manager that exceeds ~300 lines of meaningful logic is a candidate for splitting.
- Shared utilities (pure functions with no side effects) go in `utils/`. Domain-level enumerations and interfaces go in `domain/`. Neither should grow to contain business logic.

---

*This document is the authoritative architectural reference for all AI-assisted coding on the 3D Room Editor. It supersedes any generic coding conventions. When this document conflicts with a general best practice, this document wins.*
