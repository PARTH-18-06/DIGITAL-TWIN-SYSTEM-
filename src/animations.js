import * as THREE from 'three';
import { DEFAULT_OPERATION, deriveTwinState } from './controls.js';

const COOL_RESERVOIR = new THREE.Color('#7a7464');
const HOT_RESERVOIR = new THREE.Color('#b96931');
const NORMAL_ROD = new THREE.Color('#d8b56a');
const WARNING_ROD = new THREE.Color('#f0a84e');
const DANGER_ROD = new THREE.Color('#ee5b48');
const RISK_MEDIUM = new THREE.Color('#f8c44d');
const RISK_HIGH = new THREE.Color('#f06a4b');

export function createAnimationController(objects) {
  let targetState = deriveTwinState(DEFAULT_OPERATION);
  const displayState = { ...targetState };
  let comparisonState = null;
  let mode = 'current';

  const baseRodY = objects.SuckerRod.position.y;
  const basePumpY = objects.SRPPump.position.y;

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
    updatePumpVisuals(elapsed);
    updateFlow(objects.SteamFlow, 'steam', elapsed, displayState.steamFlowSpeed, displayState.thermalIndex);
    updateFlow(objects.OilFlow, 'oil', elapsed, displayState.oilFlowSpeed, displayState.mobilityIndex);
    updateRiskVisuals(elapsed);
  }

  function smoothState(delta) {
    const amount = 1 - Math.pow(0.001, delta);
    [
      'thermalIndex',
      'mobilityIndex',
      'viscosityIndex',
      'pumpDuty',
      'heatRadius',
      'oilFlowSpeed',
      'steamFlowSpeed',
      'strokeAmplitude',
      'strokeRate',
      'vfdNorm',
      'rodFloatingScore',
      'impactLoadingScore',
    ].forEach((key) => {
      displayState[key] = THREE.MathUtils.lerp(
        displayState[key] ?? targetState[key],
        targetState[key],
        amount,
      );
    });
  }

  function updateThermalVisuals(elapsed) {
    const pulse = 1 + Math.sin(elapsed * 1.4) * 0.025 * displayState.thermalIndex;
    const radius = displayState.heatRadius * pulse;

    objects.HeatedZone.scale.set(radius * 1.24, 0.34 + displayState.thermalIndex * 0.38, radius * 0.78);
    objects.HeatedZone.material.opacity = 0.1 + displayState.thermalIndex * 0.31;
    objects.HeatedZone.material.color.setHSL(
      0.08,
      0.82,
      0.48 + displayState.thermalIndex * 0.12,
    );

    objects.Reservoir.material.color.copy(COOL_RESERVOIR).lerp(HOT_RESERVOIR, displayState.thermalIndex);
    objects.Reservoir.material.opacity = 0.46 + displayState.thermalIndex * 0.18;

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

  function updatePumpVisuals(elapsed) {
    const demoCyclesPerSecond = Math.max(0.08, displayState.strokeRate / 60) * 5;
    const phase = Math.sin(elapsed * Math.PI * 2 * demoCyclesPerSecond);
    const riskJitter = Math.sin(elapsed * 38) * displayState.rodFloatingScore * 0.035;
    const strokeOffset = phase * displayState.strokeAmplitude + riskJitter;

    objects.SuckerRod.position.y = baseRodY + strokeOffset;
    objects.SRPPump.position.y = basePumpY + strokeOffset * 0.14;
    objects.PumpIntakeFlowRing.scale.setScalar(1 + displayState.mobilityIndex * 0.16 + Math.abs(phase) * 0.04);
    objects.PumpIntakeFlowRing.material.opacity = 0.34 + displayState.mobilityIndex * 0.42;

    objects.SurfaceUnit.rotation.z = phase * 0.045 * (0.4 + displayState.pumpDuty);
    objects.Motor.rotation.x = elapsed * (0.75 + displayState.vfdNorm * 4.3);

    const riskColor = displayState.rodFloatingScore > 0.68 ? DANGER_ROD : WARNING_ROD;
    objects.SuckerRod.children[0].material.color.copy(NORMAL_ROD).lerp(
      riskColor,
      Math.max(displayState.rodFloatingScore, displayState.impactLoadingScore) * 0.9,
    );
  }

  function updateRiskVisuals(elapsed) {
    const riskScore = Math.max(displayState.rodFloatingScore, displayState.impactLoadingScore);
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

function updateFlow(flow, type, elapsed, speed, intensity) {
  const positionAttribute = flow.geometry.getAttribute('position');
  const positions = positionAttribute.array;
  const { seeds } = flow.geometry.userData;
  const count = positionAttribute.count;
  const flowRate = 0.06 + speed * 0.08;

  for (let index = 0; index < count; index += 1) {
    const seed = seeds[index];
    const t = (seed + elapsed * flowRate) % 1;
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
    } else {
      const radius = 0.045 + seed * 0.07;
      const angle = seed * Math.PI * 2 + elapsed * (1.4 + speed * 0.2);
      positions[offset] = Math.cos(angle) * radius;
      positions[offset + 1] = -5.45 + t * 6.42;
      positions[offset + 2] = Math.sin(angle) * radius;
    }
  }

  flow.material.opacity = type === 'steam' ? 0.28 + intensity * 0.62 : 0.3 + intensity * 0.58;
  flow.material.size = type === 'steam' ? 0.035 + intensity * 0.052 : 0.032 + intensity * 0.064;
  positionAttribute.needsUpdate = true;
}
