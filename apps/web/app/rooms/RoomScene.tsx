"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface RoomSceneProps {
  size: number;
}

const WALL_HEIGHT = 2.7;

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
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));

    const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.0);
    sunLight.position.set(size * 0.5, size * 2, size * 0.5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = size * 5;
    sunLight.shadow.camera.left = -size;
    sunLight.shadow.camera.right = size;
    sunLight.shadow.camera.top = size;
    sunLight.shadow.camera.bottom = -size;
    scene.add(sunLight);

    // ---- Room geometry ---------------------------------------------------
    const half = size / 2;

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color: 0xc8b99a, roughness: 0.9, metalness: 0.0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor grid (tile guides)
    const grid = new THREE.GridHelper(size, size, 0x9a8a72, 0x9a8a72);
    grid.position.y = 0.002;
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Wall material — DoubleSide for reliable interior rendering
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xf0ece4,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const makeWall = () =>
      new THREE.Mesh(new THREE.PlaneGeometry(size, WALL_HEIGHT), wallMat.clone());

    // Front wall (z = -half)
    const frontWall = makeWall();
    frontWall.position.set(0, WALL_HEIGHT / 2, -half);
    frontWall.receiveShadow = true;
    scene.add(frontWall);

    // Back wall (z = +half, flipped so interior faces -Z)
    const backWall = makeWall();
    backWall.rotation.y = Math.PI;
    backWall.position.set(0, WALL_HEIGHT / 2, half);
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Left wall (x = -half, rotated so interior faces +X)
    const leftWall = makeWall();
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-half, WALL_HEIGHT / 2, 0);
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Right wall (x = +half, rotated so interior faces -X)
    const rightWall = makeWall();
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(half, WALL_HEIGHT / 2, 0);
    rightWall.receiveShadow = true;
    scene.add(rightWall);

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
    // Room is centered at origin, so we compare camera sign on each axis:
    //   front wall at z=-half → hide when camera.z < 0 (camera is on same side)
    //   back wall  at z=+half → hide when camera.z > 0
    //   left wall  at x=-half → hide when camera.x < 0
    //   right wall at x=+half → hide when camera.x > 0
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
