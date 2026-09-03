import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createTwinScene(container) {
  const scene = new THREE.Scene();
  scene.name = 'BaghewalaWellToSurfaceScene';
  scene.fog = new THREE.FogExp2('#10191b', 0.055);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.name = 'DigitalTwinCamera';
  camera.position.set(6.2, 3.55, 7.1);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor('#10191b', 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 13;
  controls.target.set(0.4, -2.12, 0);
  controls.update();

  const ambient = new THREE.HemisphereLight('#e7fbff', '#3d3022', 1.4);
  ambient.name = 'AmbientFieldLight';
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight('#fff2d3', 2.7);
  keyLight.name = 'SunsetKeyLight';
  keyLight.position.set(5, 6, 4);
  keyLight.castShadow = true;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 18;
  keyLight.shadow.camera.left = -7;
  keyLight.shadow.camera.right = 7;
  keyLight.shadow.camera.top = 7;
  keyLight.shadow.camera.bottom = -7;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight('#7ed8dd', 1.2);
  fillLight.name = 'SteamFillLight';
  fillLight.position.set(-4, 2, -3);
  scene.add(fillLight);

  const grid = new THREE.GridHelper(9, 18, '#6f7b72', '#314146');
  grid.name = 'ScaleGrid';
  grid.position.y = 0;
  scene.add(grid);

  let frameId = null;
  let onFrame = null;
  let previousTime = 0;
  let disposed = false;

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function renderFrame(timeMs = 0) {
    if (disposed) return;
    const time = timeMs / 1000;
    const delta = previousTime ? Math.min(0.06, time - previousTime) : 0.016;
    previousTime = time;

    controls.update();
    onFrame?.(delta, time);
    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(renderFrame);
  }

  function start() {
    resize();
    if (frameId === null) {
      frameId = window.requestAnimationFrame(renderFrame);
    }
  }

  function stop() {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
  }

  function dispose() {
    disposed = true;
    stop();
    controls.dispose();
    disposeObject(scene);
    renderer.dispose();
    renderer.domElement.remove();
  }

  window.addEventListener('resize', resize);

  return {
    scene,
    camera,
    renderer,
    controls,
    start,
    stop,
    resize,
    dispose() {
      window.removeEventListener('resize', resize);
      dispose();
    },
    setFrameHandler(handler) {
      onFrame = handler;
    },
  };
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value?.isTexture) value.dispose();
        });
        material.dispose();
      });
    }
  });
}
