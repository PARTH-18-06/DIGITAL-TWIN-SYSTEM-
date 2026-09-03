import * as THREE from 'three';

export const TWIN_OBJECT_NAMES = [
  'Well',
  'Reservoir',
  'SteamInjector',
  'SteamFlow',
  'ProductionTubing',
  'OilFlow',
  'WellboreLiquid',
  'SuckerRod',
  'SRPPump',
  'Motor',
  'VFD',
  'SurfaceUnit',
  'SurfaceProductionLine',
];

export function createWellModel() {
  const group = new THREE.Group();
  group.name = 'WellToSurfaceDigitalTwin';

  const materials = createMaterials();
  const objects = {};

  const reservoir = new THREE.Mesh(
    new THREE.BoxGeometry(7.8, 1.05, 4.5, 8, 1, 4),
    materials.reservoir,
  );
  reservoir.name = 'Reservoir';
  reservoir.position.set(0, -4.65, 0);
  reservoir.receiveShadow = true;
  objects.Reservoir = reservoir;
  group.add(reservoir);

  const heatedZone = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    materials.heat,
  );
  heatedZone.name = 'HeatedReservoirRegion';
  heatedZone.position.set(-0.18, -4.62, 0);
  heatedZone.scale.set(1.5, 0.36, 0.88);
  objects.HeatedZone = heatedZone;
  group.add(heatedZone);

  const well = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 6.85, 48, 1, true),
    materials.casing,
  );
  well.name = 'Well';
  well.position.set(0, -2.35, 0);
  objects.Well = well;
  group.add(well);

  const tubing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 6.7, 32, 1, true),
    materials.tubing,
  );
  tubing.name = 'ProductionTubing';
  tubing.position.set(0, -2.35, 0);
  objects.ProductionTubing = tubing;
  group.add(tubing);

  const wellboreLiquid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.205, 0.205, 1, 36),
    materials.liquid,
  );
  wellboreLiquid.name = 'WellboreLiquid';
  wellboreLiquid.position.set(0, -5.68, 0);
  wellboreLiquid.scale.y = 0.15;
  objects.WellboreLiquid = wellboreLiquid;
  group.add(wellboreLiquid);

  const rodAssembly = new THREE.Group();
  rodAssembly.name = 'SuckerRod';
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.033, 0.033, 6.2, 24),
    materials.rod,
  );
  rod.name = 'SuckerRodString';
  rod.position.set(0, -2.1, 0);
  rod.castShadow = true;
  rodAssembly.add(rod);
  objects.SuckerRod = rodAssembly;
  group.add(rodAssembly);

  const pump = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.13, 0.72, 32),
    materials.pump,
  );
  pump.name = 'SRPPump';
  pump.position.set(0, -5.55, 0);
  pump.castShadow = true;
  objects.SRPPump = pump;
  group.add(pump);

  const pumpIntake = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.018, 10, 44),
    materials.oil,
  );
  pumpIntake.name = 'PumpIntakeFlowRing';
  pumpIntake.position.set(0, -5.16, 0);
  pumpIntake.rotation.x = Math.PI / 2;
  objects.PumpIntakeFlowRing = pumpIntake;
  group.add(pumpIntake);

  const injector = new THREE.Group();
  injector.name = 'SteamInjector';
  injector.add(
    createCylinderBetween(
      new THREE.Vector3(-2.55, 0.95, -0.1),
      new THREE.Vector3(-1.15, -4.55, -0.1),
      0.065,
      materials.injector,
      'SteamInjectorPipe',
    ),
  );
  injector.add(
    createCylinderBetween(
      new THREE.Vector3(-2.98, 0.95, -0.1),
      new THREE.Vector3(-2.55, 0.95, -0.1),
      0.065,
      materials.injector,
      'SteamInjectionSurfaceLine',
    ),
  );
  objects.SteamInjector = injector;
  group.add(injector);

  const steamFlow = createParticleFlow('SteamFlow', 115, materials.steam, 'steam');
  objects.SteamFlow = steamFlow;
  group.add(steamFlow);

  const oilFlow = createParticleFlow('OilFlow', 130, materials.oilParticles, 'oil');
  objects.OilFlow = oilFlow;
  group.add(oilFlow);

  const surfaceProductionLine = createCylinderBetween(
    new THREE.Vector3(0, 0.98, 0.08),
    new THREE.Vector3(3.08, 0.98, 0.08),
    0.075,
    materials.productionLine,
    'SurfaceProductionLine',
  );
  objects.SurfaceProductionLine = surfaceProductionLine;
  group.add(surfaceProductionLine);

  const surfaceUnit = createSurfaceUnit(materials);
  objects.SurfaceUnit = surfaceUnit;
  group.add(surfaceUnit);

  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.55), materials.motor);
  motor.name = 'Motor';
  motor.position.set(2.45, 0.98, 0);
  motor.castShadow = true;
  objects.Motor = motor;
  group.add(motor);

  const vfd = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.9, 0.25), materials.vfd);
  vfd.name = 'VFD';
  vfd.position.set(3.28, 0.52, -0.82);
  vfd.castShadow = true;
  objects.VFD = vfd;
  group.add(vfd);

  const productionTank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.48, 0.82, 40),
    materials.tank,
  );
  productionTank.name = 'ProductionReceiver';
  productionTank.position.set(3.55, 0.47, 0.08);
  productionTank.rotation.z = Math.PI / 2;
  productionTank.castShadow = true;
  objects.ProductionReceiver = productionTank;
  group.add(productionTank);

  const comparisonHeatMarker = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 16),
    materials.compare,
  );
  comparisonHeatMarker.name = 'ComparisonHeatMarker';
  comparisonHeatMarker.position.copy(heatedZone.position);
  comparisonHeatMarker.visible = false;
  objects.ComparisonHeatMarker = comparisonHeatMarker;
  group.add(comparisonHeatMarker);

  const riskHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.018, 10, 56),
    materials.risk,
  );
  riskHalo.name = 'PumpRiskHalo';
  riskHalo.position.set(0, -5.55, 0);
  riskHalo.rotation.x = Math.PI / 2;
  riskHalo.visible = false;
  objects.RiskHalo = riskHalo;
  group.add(riskHalo);

  const labels = createLabels();
  objects.Labels = labels;
  group.add(labels);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(9.2, 5.6),
    materials.ground,
  );
  ground.name = 'SurfacePad';
  ground.position.set(0.5, 0.015, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  return { group, objects, materials };
}

function createMaterials() {
  return {
    reservoir: new THREE.MeshStandardMaterial({
      color: '#8a7b5d',
      roughness: 0.9,
      transparent: true,
      opacity: 0.58,
    }),
    heat: new THREE.MeshBasicMaterial({
      color: '#f18c2e',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    casing: new THREE.MeshStandardMaterial({
      color: '#c6d1d2',
      metalness: 0.48,
      roughness: 0.28,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
    }),
    tubing: new THREE.MeshStandardMaterial({
      color: '#e3eceb',
      metalness: 0.65,
      roughness: 0.21,
      transparent: true,
      opacity: 0.74,
      side: THREE.DoubleSide,
    }),
    rod: new THREE.MeshStandardMaterial({
      color: '#d8b56a',
      metalness: 0.5,
      roughness: 0.32,
    }),
    pump: new THREE.MeshStandardMaterial({
      color: '#64727b',
      metalness: 0.45,
      roughness: 0.34,
    }),
    injector: new THREE.MeshStandardMaterial({
      color: '#8fd8e8',
      metalness: 0.52,
      roughness: 0.24,
    }),
    steam: new THREE.PointsMaterial({
      color: '#d6fbff',
      size: 0.055,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    oil: new THREE.MeshBasicMaterial({
      color: '#d4b05b',
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    }),
    liquid: new THREE.MeshPhysicalMaterial({
      color: '#a6732a',
      roughness: 0.32,
      metalness: 0.02,
      transmission: 0.12,
      thickness: 0.28,
      transparent: true,
      opacity: 0.58,
    }),
    oilParticles: new THREE.PointsMaterial({
      color: '#f2c35b',
      size: 0.052,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    productionLine: new THREE.MeshStandardMaterial({
      color: '#d6c06e',
      metalness: 0.46,
      roughness: 0.28,
      transparent: true,
      opacity: 0.76,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: '#9eadb0',
      metalness: 0.55,
      roughness: 0.27,
    }),
    motor: new THREE.MeshStandardMaterial({
      color: '#244b57',
      metalness: 0.3,
      roughness: 0.46,
    }),
    vfd: new THREE.MeshStandardMaterial({
      color: '#27363d',
      metalness: 0.2,
      roughness: 0.5,
    }),
    tank: new THREE.MeshStandardMaterial({
      color: '#617172',
      metalness: 0.42,
      roughness: 0.34,
    }),
    compare: new THREE.MeshBasicMaterial({
      color: '#f5f4a6',
      transparent: true,
      opacity: 0.34,
      wireframe: true,
      depthWrite: false,
    }),
    risk: new THREE.MeshBasicMaterial({
      color: '#f8c44d',
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    label: new THREE.SpriteMaterial({
      color: '#f5f7f2',
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    }),
    ground: new THREE.MeshStandardMaterial({
      color: '#5a624e',
      roughness: 0.95,
      transparent: true,
      opacity: 0.45,
    }),
  };
}

function createSurfaceUnit(materials) {
  const unit = new THREE.Group();
  unit.name = 'SurfaceUnit';

  const base = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.12, 0.72), materials.steel);
  base.name = 'SurfaceBase';
  base.position.set(0.7, 0.12, 0);
  unit.add(base);

  const postA = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.34, 0.13), materials.steel);
  postA.name = 'SurfaceUnitPostA';
  postA.position.set(0.45, 0.82, -0.22);
  unit.add(postA);

  const postB = postA.clone();
  postB.name = 'SurfaceUnitPostB';
  postB.position.z = 0.22;
  unit.add(postB);

  const walkingBeam = new THREE.Mesh(
    new THREE.BoxGeometry(2.62, 0.12, 0.16),
    materials.steel,
  );
  walkingBeam.name = 'WalkingBeam';
  walkingBeam.position.set(0.3, 1.47, 0);
  walkingBeam.rotation.z = -0.15;
  unit.add(walkingBeam);

  const horseHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.72, 0.18),
    materials.steel,
  );
  horseHead.name = 'HorseHead';
  horseHead.position.set(-1.08, 1.22, 0);
  horseHead.rotation.z = -0.15;
  unit.add(horseHead);

  const counterweight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.18, 32),
    materials.steel,
  );
  counterweight.name = 'Counterweight';
  counterweight.position.set(1.64, 0.74, 0);
  counterweight.rotation.x = Math.PI / 2;
  unit.add(counterweight);

  return unit;
}

function createLabels() {
  const labels = new THREE.Group();
  labels.name = 'ComponentLabels';

  const labelData = [
    ['SteamInjector', [-2.55, 1.38, -0.38]],
    ['Reservoir', [2.35, -4.04, 0.05]],
    ['ProductionTubing', [0.8, -1.58, 0.1]],
    ['WellboreLiquid', [-0.92, -3.35, 0.18]],
    ['SRPPump', [0.72, -5.52, 0.12]],
    ['SurfaceUnit', [1.35, 1.85, 0.05]],
    ['VFD', [3.68, 0.85, -0.82]],
  ];

  labelData.forEach(([text, position]) => {
    const sprite = createLabelSprite(text);
    sprite.position.fromArray(position);
    labels.add(sprite);
  });

  return labels;
}

function createLabelSprite(text) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 128;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(10, 18, 20, 0.72)';
  context.fillRect(0, 22, canvas.width, 84);
  context.strokeStyle = 'rgba(196, 230, 224, 0.55)';
  context.strokeRect(1, 23, canvas.width - 2, 82);
  context.fillStyle = '#f6f8f2';
  context.font = '600 34px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = `${text}Label`;
  sprite.scale.set(1.25, 0.31, 1);
  return sprite;
}

function createCylinderBetween(start, end, radius, material, name) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 24);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(start).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  mesh.castShadow = true;
  return mesh;
}

function createParticleFlow(name, count, material, type) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    seeds[index] = seeded(index + (type === 'steam' ? 40 : 120));
    positions[index * 3] = 0;
    positions[index * 3 + 1] = 0;
    positions[index * 3 + 2] = 0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.userData = { seeds, type };

  const points = new THREE.Points(geometry, material);
  points.name = name;
  return points;
}

function seeded(value) {
  const raw = Math.sin(value * 12.9898) * 43758.5453;
  return raw - Math.floor(raw);
}
