import * as THREE from "three";
import type { LightEntry, LightProps, SelectionInfo } from "../domain/types";
import { WALL_HEIGHT } from "../domain/constants";
import { kelvinToHex } from "../utils/kelvinToHex";
import type { SelectionManager } from "./SelectionManager";
import type { FurnitureManager } from "./FurnitureManager";
import type { InspectorBridge } from "./InspectorBridge";

const LIGHT_WIRE = new THREE.LineBasicMaterial({ color: 0xffdd55, depthTest: false });

export class LightManager {
  private scene: THREE.Scene;
  private furniture: FurnitureManager;
  private selection: SelectionManager;
  private inspector: InspectorBridge;
  readonly entries: LightEntry[] = [];

  constructor(
    scene: THREE.Scene,
    furniture: FurnitureManager,
    selection: SelectionManager,
    inspector: InspectorBridge,
  ) {
    this.scene = scene;
    this.furniture = furniture;
    this.selection = selection;
    this.inspector = inspector;
  }

  addPointLight(): LightEntry {
    return this.createLight("pointLight");
  }

  addSpotLight(): LightEntry {
    return this.createLight("spotLight");
  }

  remove(entry: LightEntry): void {
    this.detachHelper(entry);
    if ((entry.light as THREE.SpotLight).target) {
      this.scene.remove((entry.light as THREE.SpotLight).target);
    }
    this.scene.remove(entry.proxy);
    const fi = this.furniture.items.indexOf(entry.proxy);
    if (fi !== -1) this.furniture.items.splice(fi, 1);
    const li = this.entries.indexOf(entry);
    if (li !== -1) this.entries.splice(li, 1);
  }

  update(entry: LightEntry, props: Partial<LightProps>): void {
    const { light, proxy } = entry;
    const current = light.userData as LightProps;
    const next = { ...current, ...props };
    light.userData = next;

    if (props.colorTemp !== undefined) light.color.set(kelvinToHex(props.colorTemp));
    if (props.intensity !== undefined) light.intensity = props.intensity;
    if (props.castShadow !== undefined) light.castShadow = props.castShadow;
    if (props.distance !== undefined) {
      if (light instanceof THREE.PointLight) light.distance = props.distance;
      if (light instanceof THREE.SpotLight) light.distance = props.distance;
    }
    if (light instanceof THREE.SpotLight) {
      if (props.angle !== undefined) light.angle = props.angle;
      if (props.penumbra !== undefined) light.penumbra = props.penumbra;
    }

    const hex = kelvinToHex(next.colorTemp);
    (proxy.material as THREE.MeshStandardMaterial).color.set(hex);
    (proxy.material as THREE.MeshStandardMaterial).emissive.set(hex);

    this.detachHelper(entry);
    this.attachHelper(entry);

    this.inspector.broadcast({ type: "light", subType: next.type, light: { ...next } }, true);
  }

  getProps(entry: LightEntry): LightProps {
    return { ...(entry.light.userData as LightProps) };
  }

  findByProxy(proxy: THREE.Mesh): LightEntry | null {
    return this.entries.find(e => e.proxy === proxy) ?? null;
  }

  attachHelper(entry: LightEntry): void {
    // Always detach first to prevent duplicate helpers on re-selection or update
    this.detachHelper(entry);
    const ld = entry.light.userData as LightProps;
    let helper: THREE.LineSegments;
    if (ld.type === "spotLight") {
      helper = this.buildSpotHelper(ld.distance, ld.angle ?? Math.PI / 6);
    } else {
      helper = this.buildPointHelper(ld.distance);
    }
    helper.renderOrder = 10;
    entry.proxy.add(helper);
    entry.helperLines = helper;
  }

  detachHelper(entry: LightEntry): void {
    if (entry.helperLines) {
      entry.proxy.remove(entry.helperLines);
      entry.helperLines.geometry.dispose();
      (entry.helperLines.material as THREE.Material).dispose();
      entry.helperLines = null;
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private createLight(type: "pointLight" | "spotLight"): LightEntry {
    const isSpot = type === "spotLight";
    const defaultProps: LightProps = {
      type,
      intensity: isSpot ? 3 : 2,
      distance: isSpot ? 4 : 3,
      castShadow: true,
      colorTemp: 3000,
      ...(isSpot ? { angle: Math.PI / 6, penumbra: 0.2 } : {}),
    };

    const proxyColor = kelvinToHex(defaultProps.colorTemp);
    const proxy = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12),
      new THREE.MeshStandardMaterial({
        color: proxyColor,
        emissive: new THREE.Color(proxyColor),
        emissiveIntensity: 0.3,
        roughness: 0.3,
        metalness: 0.1,
      }),
    );
    proxy.userData.type = type;
    proxy.userData.isLight = true;
    proxy.castShadow = false;
    proxy.receiveShadow = false;

    let light: THREE.PointLight | THREE.SpotLight;
    if (isSpot) {
      const sl = new THREE.SpotLight(
        kelvinToHex(defaultProps.colorTemp),
        defaultProps.intensity,
        defaultProps.distance,
        defaultProps.angle,
        defaultProps.penumbra,
      );
      sl.castShadow = defaultProps.castShadow;
      sl.shadow.mapSize.set(1024, 1024);
      this.scene.add(sl.target);
      sl.target.position.set(proxy.position.x, 0, proxy.position.z);
      light = sl;
    } else {
      const pl = new THREE.PointLight(
        kelvinToHex(defaultProps.colorTemp),
        defaultProps.intensity,
        defaultProps.distance,
      );
      pl.castShadow = defaultProps.castShadow;
      pl.shadow.mapSize.set(512, 512);
      light = pl;
    }
    light.userData = { ...defaultProps };
    proxy.add(light);
    proxy.position.set(0, WALL_HEIGHT * 0.75, 0);
    this.scene.add(proxy);
    this.furniture.items.push(proxy);

    const entry: LightEntry = { proxy, light, helperLines: null };
    this.entries.push(entry);
    return entry;
  }

  private buildPointHelper(distance: number): THREE.LineSegments {
    const geo = new THREE.WireframeGeometry(new THREE.SphereGeometry(distance, 16, 8));
    return new THREE.LineSegments(geo, LIGHT_WIRE.clone());
  }

  private buildSpotHelper(distance: number, angle: number): THREE.LineSegments {
    const r = distance * Math.tan(angle);
    const segments = 32;
    const positions: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * r, -distance, Math.sin(a) * r);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      positions.push(0, 0, 0, Math.cos(a) * r, -distance, Math.sin(a) * r);
    }
    positions.push(0, 0, 0, 0, -distance, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.LineSegments(geo, LIGHT_WIRE.clone());
  }
}
