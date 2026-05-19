import * as THREE from "three";

export function createLighting(scene: THREE.Scene, span: number): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight(0xdce8ff, 0x9e8a70, 1.2));
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.5);
  sun.position.set(span * 1.8, span * 2.4, span * 0.6);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = span * 8;
  const sc = span * 1.5;
  sun.shadow.camera.left = -sc;
  sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc;
  sun.shadow.camera.bottom = -sc;
  scene.add(sun);
  scene.add(sun.target);

  return sun;
}
