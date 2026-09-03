import * as THREE from 'three';
import { DEFAULT_OPERATION, deriveTwinState } from './controls.js';

const COOL_RESERVOIR = new THREE.Color('#7a7464');
const HOT_RESERVOIR = new THREE.Color('#b96931');
const NORMAL_ROD = new THREE.Color('#d8b56a');
const WARNING_ROD = new THREE.Color('#f0a84e');
const DANGER_ROD = new THREE.Color('#ee5b48');
const RISK_MEDIUM = new THREE.Color('#f8c44d');
const RISK_HIGH = new THREE.Color('#f06a4b');
const NORMAL_PUMP = new THREE.Color('#64727b');
const WARNING_PUMP = new THREE.Color('#a97838');
const DANGER_PUMP = new THREE.Color('#b94a3d');
const STEAM_FLOW = new THREE.Color('#c9fbff');
const OIL_FLOW = new THREE.Color('#f2c35b');
const STEAM_ACTIVE = new THREE.Color('#efffff');
const OIL_ACTIVE = new THREE.Color('#ffe39b');
const STEAM_PLUME_CENTER = { x: -0.9, y: -4.18, z: -0.38 };

export function createAnimationController(objects) {
  let targetState = deriveTwinState(DEFAULT_OPERATION);
  const displayState = { ...targetState };
  let comparisonState = null;
  let mode = 'current';

  const baseRodY = objects.SuckerRod.position.y;
  const basePumpY = objects.SRPPump.position.y;
  const liquidBottomY = -5.78;
  const liquidMaxHeight = 5.92;

  function setVisualState(nextState) {
    targetState = { ...targetState, ...nextState };
  }

  function setComparisonState(nextComparisonState) {
    comparisonState = nextComparisonState;
  }

  function setMode(nextMode) {
    mode = nextMode;
  }

  function tick(delta, elapsed) {
    smoothState(delta);
    updateThermalVisuals(elapsed);
    updateLiquidVisuals(elapsed);
    updatePumpVisuals(elapsed);
    updateFlow(
      objects.SteamFlow,
      'steam',
      elapsed,
      displayState.steamFlowSpeed,
      displayState.thermalIndex,
      displayState.steamActivity,
    );
    updateFlow(
      objects.OilFlow,
      'oil',
      elapsed,
      displayState.oilFlowSpeed,
      displayState.productionIndex,
      displayState.mobilityIndex,
      displayState.oilFlowDirection,
    );
    updateSeparatedFlowVisuals(elapsed);
    updateSteamPlume(elapsed);
    updateRiskVisuals(elapsed);
  }

  function smoothState(delta) {
    const amount = 1 - Math.pow(0.001, delta);
    [
      'thermalIndex',
      'mobilityIndex',
      'viscosityIndex',
      'productionIndex',
      'pumpDuty',
      'heatRadius',
      'oilLevel',
      'oilFlowRate',
      'steamFlowRate',
      'oilFlowSpeed',
      'steamFlowSpeed',
      'steamActivity',
      'strokeAmplitude',
      'strokeRate',
      'pumpStrokeSpeed',
      'vfdNorm',
      'pressureRiskScore',
      'rodFloatingScore',
      'impactLoadingScore',
      'pumpUnsettingScore',
      'rodFailureScore',
    ].forEach((key) => {
      displayState[key] = THREE.MathUtils.lerp(
        displayState[key] ?? targetState[key],
        targetState[key],
        amount,
      );
    });
    displayState.oilFlowDirection = targetState.oilFlowDirection ?? 'forward';
  }

  function updateThermalVisuals(elapsed) {
    const pulse = 1 + Math.sin(elapsed * 1.4) * 0.025 * displayState.thermalIndex;
    const radius = displayState.heatRadius * pulse;

    objects.HeatedZone.scale.set(radius * 1.24, 0.34 + displayState.thermalIndex * 0.38, radius * 0.78);
    objects.HeatedZone.material.opacity =
      0.07 + displayState.thermalIndex * 0.24 + displayState.steamActivity * 0.08;
    objects.HeatedZone.material.color.setHSL(
      0.08,
      0.82,
      0.48 + displayState.thermalIndex * 0.12,
    );

    objects.Reservoir.material.color.copy(COOL_RESERVOIR).lerp(HOT_RESERVOIR, displayState.thermalIndex);
    objects.Reservoir.material.opacity = 0.45 + displayState.thermalIndex * 0.2;

    if (comparisonState) {
      const reference =
        mode === 'optimized' ? comparisonState.current : comparisonState.optimized;
      objects.ComparisonHeatMarker.visible = true;
      objects.ComparisonHeatMarker.scale.set(
        reference.heatRadius * 1.24,
        0.34 + reference.thermalIndex * 0.38,
        reference.heatRadius * 0.78,
      );
      objects.ComparisonHeatMarker.material.opacity = mode === 'optimized' ? 0.24 : 0.3;
      objects.ComparisonHeatMarker.material.color.set(mode === 'optimized' ? '#eef0a7' : '#7bd7db');
    } else {
      objects.ComparisonHeatMarker.visible = false;
    }
  }

  function updateLiquidVisuals(elapsed) {
    const levelPulse = Math.sin(elapsed * 2.1) * 0.015 * displayState.productionIndex;
    const liquidHeight = Math.max(0.18, (displayState.oilLevel + levelPulse) * liquidMaxHeight);
    objects.WellboreLiquid.scale.y = liquidHeight;
    objects.WellboreLiquid.position.y = liquidBottomY + liquidHeight / 2;
    objects.WellboreLiquid.material.opacity =
      0.28 + displayState.oilLevel * 0.36 + displayState.mobilityIndex * 0.08;
    objects.WellboreLiquid.material.color.setHSL(
      0.09,
      0.62,
      0.25 + displayState.mobilityIndex * 0.22,
    );
  }

  function updatePumpVisuals(elapsed) {
    const demoCyclesPerSecond = Math.max(0.08, displayState.strokeRate / 60) * 5;
    const phase = Math.sin(elapsed * Math.PI * 2 * demoCyclesPerSecond);
    const equipmentRisk = Math.max(
      displayState.rodFloatingScore,
      displayState.impactLoadingScore,
      displayState.pumpUnsettingScore,
      displayState.rodFailureScore,
    );
    const riskJitter = Math.sin(elapsed * 38) * equipmentRisk * 0.045;
    const strokeOffset = phase * displayState.strokeAmplitude + riskJitter;

    objects.SuckerRod.position.y = baseRodY + strokeOffset;
    objects.SRPPump.position.y = basePumpY + strokeOffset * 0.14;
    objects.PumpIntakeFlowRing.scale.setScalar(
      1 + displayState.oilLevel * 0.2 + Math.abs(phase) * 0.05,
    );
    objects.PumpIntakeFlowRing.material.opacity =
      0.22 + displayState.mobilityIndex * 0.34 + displayState.productionIndex * 0.22;

    objects.SurfaceUnit.rotation.z = phase * 0.045 * (0.4 + displayState.pumpDuty);
    objects.Motor.rotation.x = elapsed * (0.75 + displayState.vfdNorm * 4.3);

    const riskColor = equipmentRisk > 0.68 ? DANGER_ROD : WARNING_ROD;
    objects.SuckerRod.children[0].material.color
      .copy(NORMAL_ROD)
      .lerp(riskColor, equipmentRisk * 0.9);
    objects.SRPPump.material.color
      .copy(NORMAL_PUMP)
      .lerp(equipmentRisk > 0.68 ? DANGER_PUMP : WARNING_PUMP, equipmentRisk);
    objects.SurfaceProductionLine.material.opacity =
      0.22 + displayState.productionIndex * 0.54;
  }

  function updateSeparatedFlowVisuals(elapsed) {
    const steamIntensity = Math.max(
      displayState.steamActivity,
      displayState.thermalIndex * 0.65,
    );
    const oilIntensity = Math.max(
      displayState.productionIndex,
      displayState.mobilityIndex * 0.72,
    );

    objects.SteamFlowConduit.material.opacity =
      0.18 + displayState.steamActivity * 0.36 + displayState.thermalIndex * 0.14;
    objects.SteamFlowConduit.material.color
      .copy(STEAM_FLOW)
      .lerp(STEAM_ACTIVE, steamIntensity * 0.35);
    objects.SteamFlowConduit.material.emissiveIntensity =
      0.2 + steamIntensity * 0.52;

    objects.OilFlowConduit.material.opacity =
      (0.18 + displayState.productionIndex * 0.36 + displayState.mobilityIndex * 0.18) *
      (displayState.oilFlowDirection === 'stalled' ? 0.5 : 1);
    objects.OilFlowConduit.material.color
      .copy(OIL_FLOW)
      .lerp(OIL_ACTIVE, oilIntensity * 0.28);
    objects.OilFlowConduit.material.emissiveIntensity = 0.16 + oilIntensity * 0.42;

    objects.FlowJunctions.children.forEach((node, index) => {
      const isSteam = node.userData.flowType === 'steam';
      const intensity = isSteam ? steamIntensity : oilIntensity;
      const pulseSpeed = isSteam ? 4.1 : 5.2;
      const phase =
        Math.sin(elapsed * pulseSpeed + index * 0.85) * 0.5 + 0.5;
      const baseScale = isSteam ? 0.88 : 0.94;
      node.scale.setScalar(baseScale + phase * 0.16 * intensity);
      node.material.opacity = 0.22 + intensity * 0.42 + phase * 0.12;
      node.material.color
        .copy(isSteam ? STEAM_FLOW : OIL_FLOW)
        .lerp(isSteam ? STEAM_ACTIVE : OIL_ACTIVE, phase * 0.35);
    });
  }

  function updateSteamPlume(elapsed) {
    const plume = objects.SteamReservoirPlume;
    const positionAttribute = plume.geometry.getAttribute('position');
    const positions = positionAttribute.array;
    const { seeds } = plume.geometry.userData;
    const activity = Math.max(
      displayState.steamActivity,
      displayState.thermalIndex * 0.45,
    );

    for (let index = 0; index < positionAttribute.count; index += 1) {
      const seed = seeds[index];
      const t = wrap01(seed + elapsed * (0.025 + activity * 0.08));
      const radius =
        (0.12 + t * (0.55 + displayState.thermalIndex * 0.75)) *
        (0.65 + seed * 0.5);
      const angle = seed * Math.PI * 2 + elapsed * (0.35 + activity * 0.5);
      const offset = index * 3;

      positions[offset] = STEAM_PLUME_CENTER.x + Math.cos(angle) * radius;
      positions[offset + 1] =
        STEAM_PLUME_CENTER.y +
        Math.sin(t * Math.PI) * 0.16 +
        (seed - 0.5) * 0.18;
      positions[offset + 2] =
        STEAM_PLUME_CENTER.z + Math.sin(angle) * radius * 0.62;
    }

    plume.material.opacity = 0.1 + activity * 0.62;
    plume.material.size = 0.055 + activity * 0.075;
    positionAttribute.needsUpdate = true;
  }

  function updateRiskVisuals(elapsed) {
    const riskScore = Math.max(
      displayState.rodFloatingScore,
      displayState.impactLoadingScore,
      displayState.pumpUnsettingScore,
      displayState.rodFailureScore,
      displayState.pressureRiskScore,
    );
    objects.RiskHalo.visible = riskScore > 0.32;
    objects.RiskHalo.material.opacity = riskScore > 0.32 ? 0.12 + riskScore * 0.48 : 0;
    objects.RiskHalo.material.color.copy(RISK_MEDIUM).lerp(RISK_HIGH, Math.max(0, (riskScore - 0.42) / 0.58));
    objects.RiskHalo.scale.setScalar(1 + Math.sin(elapsed * 7.2) * riskScore * 0.1);
  }

  return {
    tick,
    setMode,
    setVisualState,
    setComparisonState,
  };
}

function updateFlow(
  flow,
  type,
  elapsed,
  speed,
  intensity,
  secondaryIntensity = intensity,
  direction = 'forward',
) {
  const positionAttribute = flow.geometry.getAttribute('position');
  const positions = positionAttribute.array;
  const { seeds } = flow.geometry.userData;
  const curve = flow.geometry.userData.curve;
  const count = positionAttribute.count;
  const directionFactor =
    direction === 'reverse' ? -1 : direction === 'stalled' ? 0 : 1;
  const flowRate =
    (0.04 + Math.abs(speed) * 0.1) * (0.16 + intensity * 0.84) * directionFactor;

  if (curve) {
    updateCurveFlow({
      count,
      curve,
      direction,
      elapsed,
      flow,
      flowRate,
      intensity,
      positions,
      positionAttribute,
      secondaryIntensity,
      seeds,
      type,
    });
    return;
  }

  for (let index = 0; index < count; index += 1) {
    const seed = seeds[index];
    const t = wrap01(seed + elapsed * flowRate);
    const wobble = Math.sin((elapsed + seed * 8) * 2.8) * 0.025;
    const offset = index * 3;

    if (type === 'steam') {
      if (t < 0.72) {
        const pipeT = t / 0.72;
        positions[offset] = -2.55 + pipeT * 1.42 + wobble;
        positions[offset + 1] = 0.95 - pipeT * 5.5;
        positions[offset + 2] = -0.1 + Math.cos(seed * 12 + elapsed) * 0.055;
      } else {
        const plumeT = (t - 0.72) / 0.28;
        const plumeRadius = (0.24 + intensity * 1.15) * plumeT;
        const angle = seed * Math.PI * 2 + elapsed * 0.8;
        positions[offset] = -1.12 + Math.cos(angle) * plumeRadius + plumeT * 0.8;
        positions[offset + 1] = -4.55 + Math.sin(plumeT * Math.PI) * 0.12;
        positions[offset + 2] = -0.1 + Math.sin(angle) * plumeRadius * 0.56;
      }
    } else if (t < 0.24) {
      const reservoirT = t / 0.24;
      const angle = seed * Math.PI * 2 + elapsed * 0.6;
      positions[offset] = -1.65 + reservoirT * 1.62 + Math.cos(angle) * 0.12;
      positions[offset + 1] = -4.58 - reservoirT * 0.86;
      positions[offset + 2] = Math.sin(angle) * (0.5 - reservoirT * 0.34);
    } else if (t < 0.78) {
      const liftT = (t - 0.24) / 0.54;
      const radius = 0.045 + seed * 0.07;
      const angle = seed * Math.PI * 2 + elapsed * (1.4 + speed * 0.2);
      positions[offset] = Math.cos(angle) * radius;
      positions[offset + 1] = -5.45 + liftT * 6.42;
      positions[offset + 2] = Math.sin(angle) * radius;
    } else {
      const surfaceT = (t - 0.78) / 0.22;
      positions[offset] = surfaceT * 3.08;
      positions[offset + 1] = 0.98 + Math.sin(surfaceT * Math.PI * 2 + elapsed * 4) * 0.015;
      positions[offset + 2] = 0.08 + Math.cos(seed * 20) * 0.045;
    }
  }

  flow.material.opacity =
    type === 'steam'
      ? 0.08 + intensity * 0.18 + secondaryIntensity * 0.58
      : (0.08 + intensity * 0.5 + secondaryIntensity * 0.24) *
        (direction === 'stalled' ? 0.32 : 1);
  flow.material.size =
    type === 'steam'
      ? 0.026 + intensity * 0.025 + secondaryIntensity * 0.04
      : 0.026 + intensity * 0.056 + secondaryIntensity * 0.02;
  positionAttribute.needsUpdate = true;
}

function updateCurveFlow({
  count,
  curve,
  direction,
  elapsed,
  flow,
  flowRate,
  intensity,
  positions,
  positionAttribute,
  secondaryIntensity,
  seeds,
  type,
}) {
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const visibleFactor = direction === 'stalled' ? 0.35 : 1;

  for (let index = 0; index < count; index += 1) {
    const seed = seeds[index];
    const t = wrap01(seed + elapsed * flowRate);
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent).normalize();
    normal.set(-tangent.z, 0, tangent.x).normalize();
    if (normal.lengthSq() < 0.001) normal.set(1, 0, 0);
    binormal.crossVectors(tangent, normal).normalize();

    const radius = type === 'steam' ? 0.026 + seed * 0.03 : 0.035 + seed * 0.035;
    const angle = seed * Math.PI * 2 + elapsed * (type === 'steam' ? 1.4 : 2.2);
    const offset = index * 3;

    positions[offset] =
      point.x +
      normal.x * Math.cos(angle) * radius +
      binormal.x * Math.sin(angle) * radius;
    positions[offset + 1] =
      point.y +
      normal.y * Math.cos(angle) * radius +
      binormal.y * Math.sin(angle) * radius;
    positions[offset + 2] =
      point.z +
      normal.z * Math.cos(angle) * radius +
      binormal.z * Math.sin(angle) * radius;
  }

  flow.material.opacity =
    type === 'steam'
      ? (0.08 + intensity * 0.18 + secondaryIntensity * 0.58) * visibleFactor
      : (0.08 + intensity * 0.5 + secondaryIntensity * 0.24) * visibleFactor;
  flow.material.size =
    type === 'steam'
      ? 0.034 + intensity * 0.022 + secondaryIntensity * 0.036
      : 0.032 + intensity * 0.05 + secondaryIntensity * 0.018;
  positionAttribute.needsUpdate = true;
}

function wrap01(value) {
  return ((value % 1) + 1) % 1;
}
