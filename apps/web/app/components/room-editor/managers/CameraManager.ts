import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CameraPreset } from "../domain/types";
import { WALL_HEIGHT } from "../domain/constants";

export class CameraManager {
  private controls: OrbitControls;
  private camera: THREE.PerspectiveCamera;
  private shadowCeiling: THREE.Mesh;
  private renderer: THREE.WebGLRenderer;
  private span: number;
  private lastLabel = "Perspective";
  private onCameraChange: (label: string) => void;

  private readonly TARGET = new THREE.Vector3(0, WALL_HEIGHT * 0.3, 0);
  private readonly PRESETS: Array<{ label: string; pos: THREE.Vector3 }>;

  constructor(
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    shadowCeiling: THREE.Mesh,
    width: number,
    depth: number,
    onCameraChange: (label: string) => void,
  ) {
    this.camera = camera;
    this.renderer = renderer;
    this.shadowCeiling = shadowCeiling;
    this.onCameraChange = onCameraChange;
    this.span = Math.max(width, depth);

    this.PRESETS = [
      { label: "Perspective", pos: new THREE.Vector3(this.span * 0.9, this.span * 0.6, this.span * 0.9) },
      { label: "Top", pos: new THREE.Vector3(0, this.span * 2.5, 0.001) },
      { label: "Front", pos: new THREE.Vector3(0, this.span * 0.5, this.span * 1.8) },
      { label: "Left", pos: new THREE.Vector3(-this.span * 1.8, this.span * 0.5, 0) },
      { label: "Right", pos: new THREE.Vector3(this.span * 1.8, this.span * 0.5, 0) },
    ];

    this.controls = new OrbitControls(camera, renderer.domElement);
    this.controls.target.copy(this.TARGET);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = this.span * 0.5;
    this.controls.maxDistance = this.span * 2.8;
    this.controls.minPolarAngle = Math.PI * 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.58;
    this.controls.update();

    this.controls.addEventListener("change", this.handleChange);
    this.onCameraChange("Perspective");
  }

  get orbitControls(): OrbitControls {
    return this.controls;
  }

  get position(): THREE.Vector3 {
    return this.camera.position;
  }

  get target(): THREE.Vector3 {
    return this.controls.target;
  }

  get fov(): number {
    return this.camera.fov;
  }

  setPreset(preset: CameraPreset): void {
    const index = ["perspective", "top", "front", "left", "right"].indexOf(preset);
    const snap = this.PRESETS[index];
    this.controls.target.copy(this.TARGET);
    this.camera.position.copy(snap.pos);
    this.controls.update();
    this.lastLabel = snap.label;
    this.onCameraChange(snap.label);
    this.updateCeilingShadow(preset === "top");
  }

  update(): void {
    this.controls.update();
  }

  setEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  setOnCameraChange(cb: (label: string) => void): void {
    this.onCameraChange = cb;
  }

  dispose(): void {
    this.controls.removeEventListener("change", this.handleChange);
    this.controls.dispose();
  }

  private handleChange = (): void => {
    const label = this.detectLabel();
    if (label !== this.lastLabel) {
      this.lastLabel = label;
      this.onCameraChange(label);
      this.updateCeilingShadow(label === "Top");
    }
  };

  private detectLabel(): string {
    const p = this.camera.position;
    const threshold = this.span * 0.25;
    for (const snap of this.PRESETS) {
      if (p.distanceTo(snap.pos) < threshold) return snap.label;
    }
    return "User Perspective";
  }

  private updateCeilingShadow(isTop: boolean): void {
    if (this.shadowCeiling.castShadow !== !isTop) {
      this.shadowCeiling.castShadow = !isTop;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }
}
