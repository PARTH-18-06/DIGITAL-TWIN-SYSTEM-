import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
}

globalThis.FileReader = NodeFileReader;

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scene = new THREE.Scene();
scene.name = 'BaghewalaWellToSurfaceTwinAsset';

const materials = {
  reservoir: new THREE.MeshStandardMaterial({ color: '#8a7b5d', transparent: true, opacity: 0.62 }),
  heat: new THREE.MeshBasicMaterial({ color: '#f18c2e', transparent: true, opacity: 0.28 }),
  casing: new THREE.MeshStandardMaterial({ color: '#c6d1d2', metalness: 0.45, roughness: 0.3 }),
  tubing: new THREE.MeshStandardMaterial({ color: '#e3eceb', metalness: 0.6, roughness: 0.22 }),
  rod: new THREE.MeshStandardMaterial({ color: '#d8b56a', metalness: 0.5, roughness: 0.32 }),
  pump: new THREE.MeshStandardMaterial({ color: '#64727b', metalness: 0.45, roughness: 0.34 }),
  injector: new THREE.MeshStandardMaterial({ color: '#8fd8e8', metalness: 0.5, roughness: 0.24 }),
  steam: new THREE.MeshBasicMaterial({ color: '#d6fbff' }),
  oil: new THREE.MeshBasicMaterial({ color: '#f2c35b' }),
  liquid: new THREE.MeshStandardMaterial({ color: '#a6732a', transparent: true, opacity: 0.58 }),
  productionLine: new THREE.MeshStandardMaterial({ color: '#d6c06e', metalness: 0.46, roughness: 0.28 }),
  surface: new THREE.MeshStandardMaterial({ color: '#9eadb0', metalness: 0.55, roughness: 0.27 }),
  motor: new THREE.MeshStandardMaterial({ color: '#244b57', metalness: 0.3, roughness: 0.46 }),
  vfd: new THREE.MeshStandardMaterial({ color: '#27363d', metalness: 0.2, roughness: 0.5 }),
  tank: new THREE.MeshStandardMaterial({ color: '#617172', metalness: 0.42, roughness: 0.34 }),
};

const root = new THREE.Group();
root.name = 'WellToSurfaceDigitalTwin';
scene.add(root);

addMesh(root, 'Reservoir', new THREE.BoxGeometry(7.8, 1.05, 4.5), materials.reservoir, [0, -4.65, 0]);
addMesh(root, 'HeatedReservoirRegion', new THREE.SphereGeometry(1.8, 32, 16), materials.heat, [-0.18, -4.62, 0], [1.2, 0.25, 0.75]);
addMesh(root, 'Well', new THREE.CylinderGeometry(0.28, 0.28, 6.85, 36, 1, true), materials.casing, [0, -2.35, 0]);
addMesh(root, 'ProductionTubing', new THREE.CylinderGeometry(0.1, 0.1, 6.7, 28, 1, true), materials.tubing, [0, -2.35, 0]);
addMesh(root, 'WellboreLiquid', new THREE.CylinderGeometry(0.205, 0.205, 1, 36), materials.liquid, [0, -3.5, 0], [1, 3.2, 1]);
addMesh(root, 'SuckerRod', new THREE.CylinderGeometry(0.033, 0.033, 6.2, 18), materials.rod, [0, -2.1, 0]);
addMesh(root, 'SRPPump', new THREE.CylinderGeometry(0.16, 0.13, 0.72, 28), materials.pump, [0, -5.55, 0]);
root.add(cylinderBetween([0, 0.98, 0.08], [3.08, 0.98, 0.08], 0.075, materials.productionLine, 'SurfaceProductionLine'));

const injector = new THREE.Group();
injector.name = 'SteamInjector';
injector.add(cylinderBetween([-2.55, 0.95, -0.1], [-1.15, -4.55, -0.1], 0.065, materials.injector, 'SteamInjectorPipe'));
injector.add(cylinderBetween([-2.98, 0.95, -0.1], [-2.55, 0.95, -0.1], 0.065, materials.injector, 'SteamInjectionSurfaceLine'));
root.add(injector);

const steam = new THREE.Group();
steam.name = 'SteamFlow';
for (let index = 0; index < 16; index += 1) {
  const t = index / 15;
  addMesh(
    steam,
    `SteamParticle_${index}`,
    new THREE.SphereGeometry(0.055, 10, 8),
    materials.steam,
    [-2.55 + t * 1.65, 0.95 - t * 5.5, Math.sin(t * 10) * 0.08],
  );
}
root.add(steam);

const oil = new THREE.Group();
oil.name = 'OilFlow';
for (let index = 0; index < 18; index += 1) {
  const t = index / 17;
  addMesh(
    oil,
    `OilParticle_${index}`,
    new THREE.SphereGeometry(0.052, 10, 8),
    materials.oil,
    [Math.sin(index) * 0.06, -5.45 + t * 6.42, Math.cos(index) * 0.06],
  );
}
root.add(oil);

const surfaceUnit = new THREE.Group();
surfaceUnit.name = 'SurfaceUnit';
addMesh(surfaceUnit, 'SurfaceBase', new THREE.BoxGeometry(3.25, 0.12, 0.72), materials.surface, [0.7, 0.12, 0]);
addMesh(surfaceUnit, 'SurfaceUnitPostA', new THREE.BoxGeometry(0.13, 1.34, 0.13), materials.surface, [0.45, 0.82, -0.22]);
addMesh(surfaceUnit, 'SurfaceUnitPostB', new THREE.BoxGeometry(0.13, 1.34, 0.13), materials.surface, [0.45, 0.82, 0.22]);
addMesh(surfaceUnit, 'WalkingBeam', new THREE.BoxGeometry(2.62, 0.12, 0.16), materials.surface, [0.3, 1.47, 0], [1, 1, 1], [0, 0, -0.15]);
addMesh(surfaceUnit, 'HorseHead', new THREE.BoxGeometry(0.2, 0.72, 0.18), materials.surface, [-1.08, 1.22, 0], [1, 1, 1], [0, 0, -0.15]);
root.add(surfaceUnit);

addMesh(root, 'Motor', new THREE.BoxGeometry(0.7, 0.55, 0.55), materials.motor, [2.45, 0.98, 0]);
addMesh(root, 'VFD', new THREE.BoxGeometry(0.58, 0.9, 0.25), materials.vfd, [3.28, 0.52, -0.82]);
addMesh(root, 'ProductionReceiver', new THREE.CylinderGeometry(0.48, 0.48, 0.82, 40), materials.tank, [3.55, 0.47, 0.08], [1, 1, 1], [0, 0, Math.PI / 2]);

const arrayBuffer = await exportBinary(scene);
await writeGlb('models/well.glb', arrayBuffer);
await writeGlb('public/models/well.glb', arrayBuffer);

function addMesh(parent, name, geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.fromArray(position);
  mesh.scale.fromArray(scale);
  mesh.rotation.fromArray(rotation);
  parent.add(mesh);
  return mesh;
}

function cylinderBetween(startArray, endArray, radius, material, name) {
  const start = new THREE.Vector3().fromArray(startArray);
  const end = new THREE.Vector3().fromArray(endArray);
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 24), material);
  mesh.name = name;
  mesh.position.copy(start).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function exportBinary(inputScene) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      inputScene,
      (result) => resolve(result),
      reject,
      { binary: true },
    );
  });
}

async function writeGlb(relativePath, arrayBuffer) {
  const outputPath = path.join(projectRoot, relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(arrayBuffer));
  console.log(`Wrote ${relativePath}`);
}
