"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

export type ObjectType = "cube" | "sphere" | "cylinder";
export type ToolMode  = "translate" | "rotate";

export interface RoomSceneProps {
  size: number;
  tool: ToolMode;
  addObjectRef:    React.MutableRefObject<((type: ObjectType) => void) | null>;
  deleteSelectedRef: React.MutableRefObject<(() => void) | null>;
  onSelectionChange: (selected: boolean) => void;
}

const WALL_HEIGHT = 2.7;
const THICKNESS   = 0.15;

// --- Primitive catalogue --------------------------------------------------
const PALETTE: Record<ObjectType, number> = {
  cube:     0x7b9e87,
  sphere:   0xb07b9e,
  cylinder: 0x7b8fb0,
};
const HALF_H: Record<ObjectType, number> = {
  cube:     0.3,
  sphere:   0.35,
  cylinder: 0.4,
};

function buildGeometry(type: ObjectType): THREE.BufferGeometry {
  switch (type) {
    case "cube":     return new THREE.BoxGeometry(0.6, 0.6, 0.6);
    case "sphere":   return new THREE.SphereGeometry(0.35, 32, 16);
    case "cylinder": return new THREE.CylinderGeometry(0.3, 0.3, 0.8, 32);
  }
}

export function RoomScene({
  size,
  tool,
  addObjectRef,
  deleteSelectedRef,
  onSelectionChange,
}: RoomSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref so the tool-sync effect can reach into the live scene
  const applyToolRef = useRef<((mode: ToolMode) => void) | null>(null);

  // Sync tool prop changes into the running scene without rebuilding it
  useEffect(() => {
    applyToolRef.current?.(tool);
  }, [tool]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ---- Renderer --------------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // ---- Scene -----------------------------------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x16213e);

    // ---- Camera ----------------------------------------------------------
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(size * 0.9, size * 0.6, size * 0.9);

    // ---- Lighting --------------------------------------------------------
    scene.add(new THREE.AmbientLight(0xdce8ff, 0.9));

    const sunLight = new THREE.DirectionalLight(0xfff4e0, 3.5);
    sunLight.position.set(size * 1.8, size * 2.4, size * 0.6);
    sunLight.target.position.set(0, 0, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = size * 8;
    const sc = size * 1.5;
    sunLight.shadow.camera.left   = -sc;
    sunLight.shadow.camera.right  =  sc;
    sunLight.shadow.camera.top    =  sc;
    sunLight.shadow.camera.bottom = -sc;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // ---- Room geometry ---------------------------------------------------
    const half = size / 2;

    // Floor slab — 15 cm thick, top face at y = 0
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(size + THICKNESS * 2, THICKNESS, size + THICKNESS * 2),
      new THREE.MeshStandardMaterial({ color: 0xc8b99a, roughness: 0.9, metalness: 0.0 }),
    );
    floor.position.y = -THICKNESS / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor grid
    const grid = new THREE.GridHelper(size, size, 0x9a8a72, 0x9a8a72);
    grid.position.y = 0.002;
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Wall material
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.85 });

    const makeXWall = () =>
      new THREE.Mesh(new THREE.BoxGeometry(size + THICKNESS * 2, WALL_HEIGHT, THICKNESS), wallMat.clone());
    const makeZWall = () =>
      new THREE.Mesh(new THREE.BoxGeometry(THICKNESS, WALL_HEIGHT, size), wallMat.clone());

    const frontWall = makeXWall();
    frontWall.position.set(0, WALL_HEIGHT / 2, -(half + THICKNESS / 2));
    frontWall.castShadow = true; frontWall.receiveShadow = true;
    scene.add(frontWall);

    const backWall = makeXWall();
    backWall.position.set(0, WALL_HEIGHT / 2, half + THICKNESS / 2);
    backWall.castShadow = true; backWall.receiveShadow = true;
    scene.add(backWall);

    const leftWall = makeZWall();
    leftWall.position.set(-(half + THICKNESS / 2), WALL_HEIGHT / 2, 0);
    leftWall.castShadow = true; leftWall.receiveShadow = true;
    scene.add(leftWall);

    const rightWall = makeZWall();
    rightWall.position.set(half + THICKNESS / 2, WALL_HEIGHT / 2, 0);
    rightWall.castShadow = true; rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Invisible ceiling for shadows
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.ShadowMaterial({ opacity: 0.45, transparent: true }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_HEIGHT;
    ceiling.receiveShadow = true;
    scene.add(ceiling);

    // ---- OrbitControls ---------------------------------------------------
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, WALL_HEIGHT * 0.3, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = size * 0.5;
    controls.maxDistance = size * 2.8;
    controls.minPolarAngle = Math.PI * 0.08;
    controls.maxPolarAngle = Math.PI * 0.58;
    controls.update();

    // ---- Furniture tracking ----------------------------------------------
    const furniture: THREE.Mesh[] = [];
    let selected: THREE.Mesh | null = null;

    const EMISSIVE_SEL   = new THREE.Color(0x2255cc);
    const EMISSIVE_NONE  = new THREE.Color(0x000000);

    // ---- Surface snap ----------------------------------------------------
    // Casts a ray straight down from above the object and lands on the floor
    // or the top face of any other furniture piece below it.
    const snapToSurface = (mesh: THREE.Mesh) => {
      const halfH = mesh.userData.halfHeight as number;
      const ray = new THREE.Raycaster(
        new THREE.Vector3(mesh.position.x, WALL_HEIGHT + 1, mesh.position.z),
        new THREE.Vector3(0, -1, 0),
      );
      const targets = [floor, ...furniture.filter(f => f !== mesh)];
      const hits = ray.intersectObjects(targets, false);
      mesh.position.y = hits.length > 0 ? hits[0].point.y + halfH : halfH;
    };

    // ---- TransformControls -----------------------------------------------
    const tc = new TransformControls(camera, renderer.domElement);
    scene.add(tc as unknown as THREE.Object3D);

    let currentTool: ToolMode = tool;

    const applyTool = (mode: ToolMode) => {
      currentTool = mode;
      tc.setMode(mode);
      if (mode === "translate") {
        // Hide Y arrow — Y is auto-computed by surface snap
        tc.showX = true; tc.showY = false; tc.showZ = true;
      } else {
        // Rotate on Y axis only — furniture stays upright
        tc.showX = false; tc.showY = true; tc.showZ = false;
      }
    };

    applyTool(tool);
    applyToolRef.current = applyTool;

    // Disable orbit while dragging gizmo; track drag-end to skip next click
    let justDragged = false;
    tc.addEventListener("dragging-changed", (e) => {
      controls.enabled = !(e as unknown as { value: boolean }).value;
      if (!(e as unknown as { value: boolean }).value) {
        justDragged = true;
        // clear on next microtask so the pointerup fires first
        Promise.resolve().then(() => { justDragged = false; });
      }
    });

    // Re-snap during translate drag so object glides along the surface
    tc.addEventListener("objectChange", () => {
      if (selected && currentTool === "translate") snapToSurface(selected);
    });

    // ---- Selection highlight ---------------------------------------------
    const setSelection = (mesh: THREE.Mesh | null) => {
      if (selected === mesh) return;

      if (selected) {
        const mat = selected.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(EMISSIVE_NONE);
        mat.emissiveIntensity = 0;
        tc.detach();
      }

      selected = mesh;

      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(EMISSIVE_SEL);
        mat.emissiveIntensity = 0.35;
        tc.attach(mesh);
        applyTool(currentTool); // re-apply axis visibility after attach
      }

      onSelectionChange(mesh !== null);
    };

    // ---- Add object API (called from sidebar) ----------------------------
    addObjectRef.current = (type: ObjectType) => {
      const mesh = new THREE.Mesh(
        buildGeometry(type),
        new THREE.MeshStandardMaterial({
          color: PALETTE[type],
          roughness: 0.7,
          metalness: 0.05,
        }),
      );
      mesh.userData.isFurniture = true;
      mesh.userData.halfHeight  = HALF_H[type];
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      mesh.position.set(0, 0, 0);
      scene.add(mesh);
      furniture.push(mesh);
      snapToSurface(mesh);
      setSelection(mesh); // auto-select new object
    };

    // ---- Delete API ------------------------------------------------------
    deleteSelectedRef.current = () => {
      if (!selected) return;
      tc.detach();
      scene.remove(selected);
      furniture.splice(furniture.indexOf(selected), 1);
      selected = null;
      onSelectionChange(false);
    };

    // ---- Pointer-based click selection -----------------------------------
    // Distinguish a click (barely moved) from a camera drag
    let pdX = 0, pdY = 0;
    const onPointerDown = (e: PointerEvent) => { pdX = e.clientX; pdY = e.clientY; };
    const onPointerUp   = (e: PointerEvent) => {
      if (justDragged) return;
      if (Math.hypot(e.clientX - pdX, e.clientY - pdY) > 6) return;

      const rect   = renderer.domElement.getBoundingClientRect();
      const mouse  = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, camera);
      const hits = ray.intersectObjects(furniture, false);
      setSelection(hits.length > 0 ? hits[0].object as THREE.Mesh : null);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup",   onPointerUp);

    // ---- Wall hiding (Sims-style) ----------------------------------------
    const updateWalls = () => {
      const cx = camera.position.x;
      const cz = camera.position.z;
      frontWall.visible = cz >= 0;
      backWall.visible  = cz <= 0;
      leftWall.visible  = cx >= 0;
      rightWall.visible = cx <= 0;
    };

    // ---- Animation loop --------------------------------------------------
    let rafId: number;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      updateWalls();
      renderer.render(scene, camera);
    };
    animate();

    // ---- Resize observer -------------------------------------------------
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup",   onPointerUp);
      addObjectRef.current    = null;
      deleteSelectedRef.current = null;
      applyToolRef.current    = null;
      tc.dispose();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [size]); // only rebuild scene when room size changes

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-4 rounded-xl bg-black/50 backdrop-blur-sm px-4 py-2 text-xs text-white/60 pointer-events-none select-none">
        <span>Drag to rotate</span>
        <span className="opacity-40">·</span>
        <span>Scroll to zoom</span>
        <span className="opacity-40">·</span>
        <span>Click object to select</span>
      </div>
    </div>
  );
}
