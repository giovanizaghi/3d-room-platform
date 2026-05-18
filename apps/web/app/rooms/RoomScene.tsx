"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface RoomSceneProps {
  size: number;
}

const WALL_HEIGHT = 2.7;
const THICKNESS = 0.15;

export function RoomScene({ size }: RoomSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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
    // Soft ambient fill so the room interior isn't completely black
    scene.add(new THREE.AmbientLight(0xdce8ff, 0.9));

    // Sun: angled from outside the room (high + offset) for dramatic interior shadows
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

    // Floor slab — 15 cm thick, sits with top face at y=0
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(size + THICKNESS * 2, THICKNESS, size + THICKNESS * 2),
      new THREE.MeshStandardMaterial({ color: 0xc8b99a, roughness: 0.9, metalness: 0.0 }),
    );
    floor.position.y = -THICKNESS / 2;
    floor.castShadow = false;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor grid (tile guides) — sits just above floor surface
    const grid = new THREE.GridHelper(size, size, 0x9a8a72, 0x9a8a72);
    grid.position.y = 0.002;
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Wall material
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xf0ece4,
      roughness: 0.85,
      metalness: 0.0,
    });

    // Front & back walls span the full room width (x-axis)
    const makeXWall = () =>
      new THREE.Mesh(
        new THREE.BoxGeometry(size + THICKNESS * 2, WALL_HEIGHT, THICKNESS),
        wallMat.clone(),
      );

    // Left & right walls span the interior depth (z-axis) — no overlap at corners
    const makeZWall = () =>
      new THREE.Mesh(
        new THREE.BoxGeometry(THICKNESS, WALL_HEIGHT, size),
        wallMat.clone(),
      );

    // Front wall (z = -half - THICKNESS/2, outer face at z = -half - THICKNESS)
    const frontWall = makeXWall();
    frontWall.position.set(0, WALL_HEIGHT / 2, -(half + THICKNESS / 2));
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    scene.add(frontWall);

    // Back wall (z = +half + THICKNESS/2)
    const backWall = makeXWall();
    backWall.position.set(0, WALL_HEIGHT / 2, half + THICKNESS / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Left wall (x = -half - THICKNESS/2)
    const leftWall = makeZWall();
    leftWall.position.set(-(half + THICKNESS / 2), WALL_HEIGHT / 2, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Right wall (x = +half + THICKNESS/2)
    const rightWall = makeZWall();
    rightWall.position.set(half + THICKNESS / 2, WALL_HEIGHT / 2, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Invisible ceiling — receives shadows only via ShadowMaterial.
    // The plane itself is transparent; only the shadow is drawn,
    // creating soft sun patches on the floor visible through the open top.
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.ShadowMaterial({ opacity: 0.45, transparent: true }),
    );
    ceiling.rotation.x = Math.PI / 2;  // face downward
    ceiling.position.y = WALL_HEIGHT;
    ceiling.receiveShadow = true;
    scene.add(ceiling);

    // ---- OrbitControls ---------------------------------------------------
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, WALL_HEIGHT * 0.3, 0); // look slightly above floor
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = size * 0.5;
    controls.maxDistance = size * 2.8;
    controls.minPolarAngle = Math.PI * 0.08; // near top-down but not fully
    controls.maxPolarAngle = Math.PI * 0.58; // can't dip below floor
    controls.update();

    // ---- Wall hiding (Sims-style) ----------------------------------------
    // Each frame: hide the 2 walls closest to the camera so we can see inside.
    // Walls are now 15 cm thick boxes; the hide threshold accounts for thickness.
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
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {/* Controls hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-4 rounded-xl bg-black/50 backdrop-blur-sm px-4 py-2 text-xs text-white/60 pointer-events-none select-none">
        <span>Drag to rotate</span>
        <span className="opacity-40">·</span>
        <span>Scroll to zoom</span>
      </div>
    </div>
  );
}
