import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type {
  ObjectType,
  ToolMode,
  CameraPreset,
  WallId,
  LightProps,
  MaterialProps,
  TransformData,
  EditorConfig,
  EditorCallbacks,
  SceneMetadata,
  LightExport,
} from "../domain/types";
import { FLOOR_TYPES, WALL_TYPES, LIGHT_TYPES, WALL_HEIGHT } from "../domain/constants";
import { disposeObject } from "../utils/disposeThree";
import { createScene } from "../scene/SceneFactory";
import { createLighting } from "../scene/LightingFactory";
import { createRoomGeometry } from "../scene/RoomFactory";
import { InspectorBridge } from "../managers/InspectorBridge";
import { CameraManager } from "../managers/CameraManager";
import { SelectionManager } from "../managers/SelectionManager";
import { TransformManager } from "../managers/TransformManager";
import { FurnitureManager } from "../managers/FurnitureManager";
import { WallObjectManager } from "../managers/WallObjectManager";
import { LightManager } from "../managers/LightManager";
import { MaterialManager } from "../managers/MaterialManager";
import { EventManager } from "../managers/EventManager";
import { RenderLoop } from "../managers/RenderLoop";

export class EditorEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private cameraManager: CameraManager;
  private selectionManager: SelectionManager;
  private transformManager: TransformManager;
  private furnitureManager: FurnitureManager;
  private wallObjectManager: WallObjectManager;
  private lightManager: LightManager;
  private materialManager: MaterialManager;
  private eventManager: EventManager;
  private renderLoop: RenderLoop;
  private inspectorBridge: InspectorBridge;
  private width: number;
  private depth: number;

  constructor(config: EditorConfig, callbacks: EditorCallbacks) {
    const { width, depth, container } = config;
    this.width = width;
    this.depth = depth;

    // 1. Scene setup
    const { renderer, scene, camera } = createScene(container, width, depth);
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // 2. Lighting
    createLighting(scene, Math.max(width, depth));

    // 3. Room geometry
    const { floor, grid, walls, shadowCeiling } = createRoomGeometry(width, depth);
    scene.add(floor, grid, shadowCeiling);
    Object.values(walls).forEach(w => scene.add(w));

    // 4. Inspector bridge
    this.inspectorBridge = new InspectorBridge(callbacks.onInspectorChange);

    // 5. Camera manager
    this.cameraManager = new CameraManager(
      camera,
      renderer,
      shadowCeiling,
      width,
      depth,
      callbacks.onCameraChange,
    );

    // 6. Selection manager (needs TC reference — we'll set it below)
    // Create TransformManager first to get TC instance
    // But TransformManager needs SelectionManager...
    // Solution: create SelectionManager with a placeholder TC, then wire it up

    // We build a temporary TransformControls just for SelectionManager's initial construction
    // Actually, let's restructure: SelectionManager uses TC from TransformManager
    // We'll create them in this order:
    // FurnitureManager → (needs no managers)
    // SelectionManager → (needs TC, InspectorBridge, onWallSelect)
    // TransformManager → (needs SelectionManager, WallObjectManager, FurnitureManager, CameraManager)
    // WallObjectManager → (needs FurnitureManager, SelectionManager)

    // 6a. FurnitureManager
    this.furnitureManager = new FurnitureManager(scene, floor);

    // 6b. Create TransformControls directly so SelectionManager can reference it
    const tc = new TransformControls(camera, renderer.domElement);
    tc.size = 1.2;
    scene.add(tc.getHelper());

    // 6c. SelectionManager
    this.selectionManager = new SelectionManager(tc, this.inspectorBridge, callbacks.onWallSelect);

    // 6d. WallObjectManager
    this.wallObjectManager = new WallObjectManager(
      scene,
      walls,
      width,
      depth,
      this.furnitureManager,
      this.selectionManager,
    );

    // 6e. TransformManager (shares the same tc instance)
    this.transformManager = new TransformManager(
      tc,
      scene,
      this.selectionManager,
      this.wallObjectManager,
      this.furnitureManager,
      this.cameraManager,
    );

    // 6f. LightManager
    this.lightManager = new LightManager(
      scene,
      this.furnitureManager,
      this.selectionManager,
      this.inspectorBridge,
    );

    // 6g. MaterialManager
    this.materialManager = new MaterialManager(
      this.selectionManager,
      this.inspectorBridge,
      floor,
      (wallId) => this.wallObjectManager.getWallMesh(wallId as WallId),
    );

    // 6h. EventManager
    this.eventManager = new EventManager(
      renderer,
      camera,
      floor,
      this.selectionManager,
      this.furnitureManager,
      this.wallObjectManager,
      this.lightManager,
      this.transformManager,
    );

    // 7. Render loop
    this.renderLoop = new RenderLoop(
      renderer,
      scene,
      camera,
      container,
      this.cameraManager,
      this.wallObjectManager,
    );
    this.renderLoop.start();

    // 8. Wire cross-manager callbacks (avoids circular constructor deps)
    this.selectionManager.setLightCleanupCallback(entry => this.lightManager.detachHelper(entry));
  }

  // ── Public API (called by React refs) ───────────────────────────────────

  addObject(type: ObjectType): void {
    if (LIGHT_TYPES.has(type)) {
      const entry = type === "spotLight"
        ? this.lightManager.addSpotLight()
        : this.lightManager.addPointLight();
      const lp = this.lightManager.getProps(entry);
      this.selectionManager.selectLight(entry, lp);
      this.lightManager.attachHelper(entry);
    } else if (WALL_TYPES.has(type)) {
      const wallId = this.selectionManager.selectedWallId ?? "front";
      const mesh = this.wallObjectManager.createWallObject(type, wallId);
      this.selectionManager.selectObject(mesh);
      this.transformManager.applyAxisConstraints(mesh);
    } else if (FLOOR_TYPES.has(type)) {
      const mesh = this.furnitureManager.create(type);
      this.selectionManager.selectObject(mesh);
    }
  }

  deleteSelected(): void {
    const sel = this.selectionManager.selection;
    if (!sel) return;

    if (sel.kind === "object") {
      const mesh = sel.mesh;
      this.selectionManager.clearAll();
      if (mesh.userData.isWallObject) {
        this.wallObjectManager.remove(mesh);
      }
      this.furnitureManager.remove(mesh);
    } else if (sel.kind === "light") {
      const entry = sel.entry;
      this.selectionManager.clearAll();
      this.lightManager.remove(entry);
    }
  }

  clearSelection(): void {
    const lightEntry = this.selectionManager.selectedLight;
    if (lightEntry) this.lightManager.detachHelper(lightEntry);
    this.selectionManager.clearAll();
  }

  setCameraPreset(preset: CameraPreset): void {
    this.cameraManager.setPreset(preset);
  }

  setTool(mode: ToolMode): void {
    this.transformManager.setTool(mode);
  }

  updateLight(props: Partial<LightProps>): void {
    const entry = this.selectionManager.selectedLight;
    if (entry) this.lightManager.update(entry, props);
  }

  updateMaterial(props: Partial<MaterialProps>): void {
    this.materialManager.update(props);
  }

  updateTransform(props: Partial<TransformData>): void {
    const sel = this.selectionManager.selection;
    if (!sel) return;

    const mesh = sel.kind === "object"
      ? sel.mesh
      : sel.kind === "light"
        ? sel.entry.proxy
        : null;
    if (!mesh) return;

    if (props.position) {
      if (props.position.x !== undefined) mesh.position.x = props.position.x;
      if (props.position.y !== undefined) mesh.position.y = props.position.y;
      if (props.position.z !== undefined) mesh.position.z = props.position.z;
    }
    if (props.rotation) {
      if (props.rotation.x !== undefined) mesh.rotation.x = THREE.MathUtils.degToRad(props.rotation.x);
      if (props.rotation.y !== undefined) mesh.rotation.y = THREE.MathUtils.degToRad(props.rotation.y);
      if (props.rotation.z !== undefined) mesh.rotation.z = THREE.MathUtils.degToRad(props.rotation.z);
    }

    if (mesh.userData.isWallObject) {
      this.wallObjectManager.constrainToWall(mesh);
    } else if (sel.kind === "object") {
      this.furnitureManager.snapToSurface(mesh);
    }

    this.selectionManager.broadcastCurrent(true);
  }

  captureScreenshot(): string {
    return this.renderer.domElement.toDataURL("image/png");
  }

  exportScene(): Promise<{ glb: ArrayBuffer; metadata: SceneMetadata }> {
    // Build metadata
    const camPos = this.cameraManager.position;
    const camTarget = this.cameraManager.target;
    const lights: LightExport[] = this.lightManager.entries.map(entry => {
      const pos = entry.proxy.position;
      const p = entry.light.userData as LightProps;
      return {
        type: p.type,
        position: { x: pos.x, y: pos.y, z: pos.z },
        intensity: p.intensity,
        distance: p.distance,
        colorTemp: p.colorTemp,
        castShadow: p.castShadow,
        ...(p.angle !== undefined ? { angle: p.angle } : {}),
        ...(p.penumbra !== undefined ? { penumbra: p.penumbra } : {}),
      };
    });

    const metadata: SceneMetadata = {
      camera: {
        position: { x: camPos.x, y: camPos.y, z: camPos.z },
        target: { x: camTarget.x, y: camTarget.y, z: camTarget.z },
        fov: this.cameraManager.fov,
      },
      lights,
      roomDimensions: { width: this.width, depth: this.depth },
      hiddenWalls: this.wallObjectManager.getHiddenWalls(),
      ceilingHeight: WALL_HEIGHT,
    };

    // Build a minimal scene containing only exportable objects (no helpers, wireframes, grids)
    const exportScene = new THREE.Scene();
    this.scene.traverse(obj => {
      if (obj.userData.excludeFromExport) return;
      if (!(obj instanceof THREE.Mesh)) return;
      // Skip light proxy helpers (helperLines are LineSegments, not Meshes — but proxy itself is fine)
      if (obj.userData.isLight) return; // light proxies are octahedra, not needed in Blender scene
      exportScene.add(obj.clone());
    });

    return new Promise((resolve, reject) => {
      const exporter = new GLTFExporter();
      exporter.parse(
        exportScene,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve({ glb: result, metadata });
          } else {
            // Should not happen with binary:true, but handle gracefully
            const json = JSON.stringify(result);
            const buf = new TextEncoder().encode(json).buffer as ArrayBuffer;
            resolve({ glb: buf, metadata });
          }
        },
        (err) => reject(err),
        { binary: true },
      );
    });
  }

  dispose(): void {
    this.renderLoop.dispose();
    this.eventManager.dispose();
    this.transformManager.dispose();
    this.cameraManager.dispose();
    this.renderer.domElement.remove();
    disposeObject(this.scene);
    this.renderer.dispose();
  }
}
