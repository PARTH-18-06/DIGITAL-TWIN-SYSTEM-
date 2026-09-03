export const PARAMETER_SPECS = [
  {
    key: 'reservoirTemperature',
    label: 'Reservoir temperature',
    unit: 'C',
    min: 40,
    max: 95,
    step: 1,
  },
  {
    key: 'reservoirPressure',
    label: 'Reservoir pressure',
    unit: 'bar',
    min: 10,
    max: 80,
    step: 1,
  },
  {
    key: 'steamVolume',
    label: 'Steam volume',
    unit: 't',
    min: 200,
    max: 1800,
    step: 25,
  },
  {
    key: 'injectionPressure',
    label: 'Injection pressure',
    unit: 'bar',
    min: 8,
    max: 40,
    step: 1,
  },
  {
    key: 'soakTime',
    label: 'Soak time',
    unit: 'hr',
    min: 4,
    max: 72,
    step: 1,
  },
  {
    key: 'productionCutoff',
    label: 'Production cutoff',
    unit: 'bpd',
    min: 4,
    max: 60,
    step: 0.5,
  },
  {
    key: 'strokeLength',
    label: 'Stroke length',
    unit: 'in',
    min: 36,
    max: 96,
    step: 1,
  },
  {
    key: 'spm',
    label: 'Pump speed',
    unit: 'spm',
    min: 3,
    max: 16,
    step: 0.5,
  },
  {
    key: 'vfdFrequency',
    label: 'VFD frequency',
    unit: 'Hz',
    min: 25,
    max: 60,
    step: 1,
  },
];

export const DEFAULT_OPERATION = {
  reservoirTemperature: 55,
  reservoirPressure: 35,
  steamVolume: 1000,
  injectionPressure: 20,
  soakTime: 24,
  productionCutoff: 10,
  strokeLength: 60,
  spm: 8,
  vfdFrequency: 40,
};

export const MODE_LABELS = {
  current: 'Current Operation',
  optimized: 'AI Recommended Operation',
};

export const PREDICTION_LABELS = {
  oilProduction: { label: 'Oil production', unit: 'bpd' },
  sor: { label: 'Steam oil ratio', unit: '' },
  energyPerBarrel: { label: 'Energy per barrel', unit: '' },
  rodFloatingRisk: { label: 'Rod floating risk', unit: '%' },
  impactLoadingRisk: { label: 'Impact loading risk', unit: '%' },
  pumpUnsettingRisk: { label: 'Pump unsetting risk', unit: '%' },
  rodFailureRisk: { label: 'Rod failure risk', unit: '%' },
};

export const SIMULATION_PHASES = [
  { key: 'steamInjection', label: 'Steam Injection' },
  { key: 'heating', label: 'Heating' },
  { key: 'soaking', label: 'Soaking' },
  { key: 'production', label: 'Production' },
  { key: 'cooling', label: 'Cooling' },
];

const SPECS_BY_KEY = Object.fromEntries(
  PARAMETER_SPECS.map((spec) => [spec.key, spec]),
);

export function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function normalizeOperation(input = {}, fallback = DEFAULT_OPERATION) {
  return PARAMETER_SPECS.reduce((operation, spec) => {
    const sourceValue =
      input[spec.key] ?? fallback[spec.key] ?? DEFAULT_OPERATION[spec.key];
    operation[spec.key] = clampNumber(sourceValue, spec.min, spec.max);
    return operation;
  }, {});
}

export function updateOperationValue(operation, key, value) {
  const spec = SPECS_BY_KEY[key];
  if (!spec) return normalizeOperation(operation);

  return normalizeOperation({
    ...operation,
    [key]: clampNumber(value, spec.min, spec.max),
  });
}

export function getParameterSpec(key) {
  return SPECS_BY_KEY[key];
}

export function formatValue(value, spec) {
  const number = Number(value);
  const display = Number.isInteger(number) ? number.toFixed(0) : number.toFixed(1);
  return spec.unit ? `${display} ${spec.unit}` : display;
}

export function riskLevel(score) {
  if (score >= 0.68) return 'HIGH';
  if (score >= 0.38) return 'MEDIUM';
  return 'LOW';
}

export function deriveTwinState(
  parameters = DEFAULT_OPERATION,
  predictions = {},
  simulationSnapshot = null,
  liveSimulation = null,
) {
  const operation = normalizeOperation(parameters);
  const liveState = normalizeLiveSimulation(liveSimulation);
  const steamNorm = normalize01((operation.steamVolume - 200) / 1600);
  const temperatureFactor = simulationSnapshot?.temperatureFactor ?? 1;
  const steamActivityFactor = simulationSnapshot?.steamActivityFactor ?? 1;
  const productionFactor = simulationSnapshot?.productionFactor ?? 1;
  const effectiveReservoirTemperature =
    40 + (operation.reservoirTemperature - 40) * temperatureFactor;
  const tempNorm = normalize01((effectiveReservoirTemperature - 40) / 55);
  const pressureNorm = normalize01((operation.reservoirPressure - 10) / 70);
  const injectionNorm = normalize01((operation.injectionPressure - 8) / 32);
  const soakNorm = normalize01((operation.soakTime - 4) / 68);
  const cutoffNorm = normalize01((operation.productionCutoff - 4) / 56);
  const pumpNorm = normalize01((operation.spm - 3) / 13);
  const vfdNorm = normalize01((operation.vfdFrequency - 25) / 35);
  const strokeNorm = normalize01((operation.strokeLength - 36) / 60);
  const aiOilProduction = readNumericPrediction(predictions, [
    'oilProduction',
    'predictedOilProduction',
    'production',
  ]);
  let productionIndex =
    aiOilProduction === null
      ? normalize01((tempNorm * 0.45 + pumpNorm * 0.24 + pressureNorm * 0.18 + steamNorm * 0.13) * productionFactor)
      : normalize01((aiOilProduction / Math.max(operation.productionCutoff, 1)) * 0.55);

  let thermalIndex = normalize01(
    tempNorm * 0.55 +
      steamNorm * steamActivityFactor * 0.3 +
      injectionNorm * 0.08 +
      soakNorm * 0.07,
  );
  let mobilityIndex = normalize01(
    (0.18 + thermalIndex * 0.62 + pressureNorm * 0.08 - pumpNorm * 0.05) *
      (0.55 + productionFactor * 0.45),
  );
  let viscosityIndex = normalize01(1 - mobilityIndex);
  let pumpDuty = normalize01(pumpNorm * 0.68 + vfdNorm * 0.22 + strokeNorm * 0.1);
  let heatRadius = 0.8 + thermalIndex * 2.4;
  let oilLevel = normalize01(
    0.16 + mobilityIndex * 0.42 + productionIndex * 0.24 + pressureNorm * 0.12 - cutoffNorm * 0.08,
  );
  let oilFlowRate =
    aiOilProduction ?? Number((operation.productionCutoff * productionIndex).toFixed(2));
  const steamFlowRate = Number(
    (operation.steamVolume * steamActivityFactor * (0.34 + injectionNorm * 0.66)).toFixed(2),
  );
  let oilFlowSpeed = 0.18 + mobilityIndex * 1.15 + pumpDuty * 0.35 + productionIndex * 1.25;
  const steamFlowSpeed = 0.08 + steamNorm * steamActivityFactor * 1.55 + injectionNorm * 0.55;
  const strokeAmplitude = 0.24 + strokeNorm * 0.58;
  let strokeRate = operation.spm;
  let pumpStrokeSpeed = operation.spm;
  let oilFlowDirection = 'forward';
  let pressureRiskScore = normalize01(
    Math.max(0, injectionNorm - 0.78) * 1.7 + Math.max(0, 0.18 - pressureNorm) * 1.4,
  );

  const predictedRodFloatingRisk = readRiskPrediction(predictions, 'rodFloatingRisk');
  const predictedImpactLoadingRisk = readRiskPrediction(predictions, 'impactLoadingRisk');
  const predictedPumpUnsettingRisk = readRiskPrediction(predictions, 'pumpUnsettingRisk');
  const predictedRodFailureRisk = readRiskPrediction(predictions, 'rodFailureRisk');

  let rodFloatingScore = normalize01(
    predictedRodFloatingRisk ??
      (pumpDuty * 0.52 + viscosityIndex * 0.36 + pressureNorm * 0.08 - thermalIndex * 0.12),
  );
  let impactLoadingScore = normalize01(
    predictedImpactLoadingRisk ??
    viscosityIndex * 0.46 + pumpDuty * 0.38 + strokeNorm * 0.16 - thermalIndex * 0.08,
  );
  let pumpUnsettingScore = normalize01(
    predictedPumpUnsettingRisk ??
      pressureRiskScore * 0.35 + pumpDuty * 0.26 + viscosityIndex * 0.2 + injectionNorm * 0.12,
  );
  let rodFailureScore = normalize01(
    predictedRodFailureRisk ??
      Math.max(rodFloatingScore, impactLoadingScore) * 0.45 + pumpUnsettingScore * 0.22,
  );
  let rodMovement =
    Math.max(rodFloatingScore, impactLoadingScore, rodFailureScore) >= 0.68
      ? 'critical'
      : Math.max(rodFloatingScore, impactLoadingScore, rodFailureScore) >= 0.38
        ? 'warning'
        : 'normal';

  if (liveState) {
    if (liveState.temperatureColorValue !== null) {
      thermalIndex = liveState.temperatureColorValue;
      heatRadius = 0.8 + thermalIndex * 2.4;
      mobilityIndex = normalize01(mobilityIndex * 0.58 + thermalIndex * 0.42);
      viscosityIndex = normalize01(1 - mobilityIndex);
      oilLevel = normalize01(
        0.16 + mobilityIndex * 0.42 + productionIndex * 0.24 + pressureNorm * 0.12 - cutoffNorm * 0.08,
      );
    }

    if (liveState.pressureIntensity !== null) {
      pressureRiskScore = Math.max(pressureRiskScore, liveState.pressureIntensity);
      pumpUnsettingScore = Math.max(pumpUnsettingScore, liveState.pressureIntensity * 0.64);
    }

    if (liveState.flowDirection) {
      oilFlowDirection = liveState.flowDirection;
    }

    if (liveState.flowSpeed !== null) {
      const flow = liveState.flowDirection === 'stalled' ? 0 : liveState.flowSpeed;
      productionIndex = normalize01(productionIndex * 0.45 + flow * 0.55);
      oilFlowSpeed = liveState.flowDirection === 'stalled' ? 0 : 0.12 + flow * 2.35;
      oilFlowRate = Number((Math.max(operation.productionCutoff * flow, oilFlowRate * 0.35)).toFixed(2));
      oilLevel = normalize01(oilLevel * 0.7 + flow * 0.3);
    }

    if (liveState.pumpStrokeSpeed !== null) {
      pumpStrokeSpeed = clampNumber(liveState.pumpStrokeSpeed, 0, 30);
      strokeRate = pumpStrokeSpeed;
      pumpDuty = Math.max(pumpDuty, normalize01((pumpStrokeSpeed - 3) / 13));
    }

    if (liveState.rodMovementBehavior === 'floating_risk') {
      rodFloatingScore = Math.max(rodFloatingScore, 0.72);
    } else if (liveState.rodMovementBehavior === 'impact_risk') {
      impactLoadingScore = Math.max(impactLoadingScore, 0.72);
    }

    rodFailureScore = Math.max(
      rodFailureScore,
      Math.max(rodFloatingScore, impactLoadingScore) * 0.58,
    );
    rodMovement =
      Math.max(rodFloatingScore, impactLoadingScore, rodFailureScore) >= 0.68
        ? 'critical'
        : Math.max(rodFloatingScore, impactLoadingScore, rodFailureScore) >= 0.38
          ? 'warning'
          : 'normal';
  }

  return {
    parameters: operation,
    effectiveReservoirTemperature,
    thermalIndex,
    mobilityIndex,
    viscosityIndex,
    productionIndex,
    pumpDuty,
    heatRadius,
    oilLevel,
    oilFlowRate,
    steamFlowRate,
    oilFlowSpeed,
    oilFlowDirection,
    steamFlowSpeed,
    steamActivity: steamActivityFactor,
    strokeAmplitude,
    strokeRate,
    pumpStrokeSpeed,
    vfdNorm,
    pressureRiskScore,
    rodFloatingScore,
    impactLoadingScore,
    pumpUnsettingScore,
    rodFailureScore,
    rodFloatingRisk: riskLevel(rodFloatingScore),
    impactLoadingRisk: riskLevel(impactLoadingScore),
    pumpUnsettingRisk: riskLevel(pumpUnsettingScore),
    rodFailureRisk: riskLevel(rodFailureScore),
    pressureRisk: riskLevel(pressureRiskScore),
    rodMovement,
    systemState: simulationSnapshot?.systemState ?? 'STATIC',
    simulation: simulationSnapshot,
    liveSimulation: liveState,
    warnings: liveState?.warnings ?? [],
    predictions,
  };
}

export function parseBackendPayload(payload = {}, fallback = DEFAULT_OPERATION) {
  const recommended = payload.recommendedParameters ?? payload.parameters ?? payload;
  const predictions = payload.predictions ?? {};

  return {
    parameters: normalizeOperation(recommended, fallback),
    predictions,
  };
}

export function summarizeTwinState(state) {
  return {
    mobilityIndex: Math.round(state.mobilityIndex * 100),
    viscosityIndex: Math.round(state.viscosityIndex * 100),
    thermalIndex: Math.round(state.thermalIndex * 100),
    oilLevel: Math.round(state.oilLevel * 100),
    productionIndex: Math.round(state.productionIndex * 100),
    pumpDuty: Math.round(state.pumpDuty * 100),
    rodFloatingRisk: state.rodFloatingRisk,
    impactLoadingRisk: state.impactLoadingRisk,
    pumpUnsettingRisk: state.pumpUnsettingRisk,
    rodFailureRisk: state.rodFailureRisk,
    pressureRisk: state.pressureRisk,
  };
}

export function getCssTimelineSnapshot(parameters = DEFAULT_OPERATION, timeSeconds = 0) {
  const operation = normalizeOperation(parameters);
  const soakNorm = normalize01((operation.soakTime - 4) / 68);
  const phaseDurations = [
    16,
    20,
    14 + soakNorm * 22,
    28,
    24,
  ];
  const cycleDuration = phaseDurations.reduce((sum, duration) => sum + duration, 0);
  const normalizedTime = ((Number(timeSeconds) || 0) % cycleDuration + cycleDuration) % cycleDuration;
  let cursor = 0;
  let phaseIndex = 0;

  for (let index = 0; index < phaseDurations.length; index += 1) {
    if (normalizedTime <= cursor + phaseDurations[index]) {
      phaseIndex = index;
      break;
    }
    cursor += phaseDurations[index];
  }

  const phase = SIMULATION_PHASES[phaseIndex];
  const phaseDuration = phaseDurations[phaseIndex];
  const phaseProgress = normalize01((normalizedTime - cursor) / phaseDuration);
  const eased = smoothstep(phaseProgress);
  let temperatureFactor = 1;
  let steamActivityFactor = 1;
  let productionFactor = 1;

  if (phase.key === 'steamInjection') {
    temperatureFactor = 0.58 + eased * 0.23;
    steamActivityFactor = 1;
    productionFactor = 0.22 + eased * 0.16;
  } else if (phase.key === 'heating') {
    temperatureFactor = 0.81 + eased * 0.18;
    steamActivityFactor = 0.76 - eased * 0.24;
    productionFactor = 0.38 + eased * 0.28;
  } else if (phase.key === 'soaking') {
    temperatureFactor = 1 - Math.sin(phaseProgress * Math.PI) * 0.03;
    steamActivityFactor = 0.3 - eased * 0.12;
    productionFactor = 0.66 + eased * 0.12;
  } else if (phase.key === 'production') {
    temperatureFactor = 0.97 - eased * 0.14;
    steamActivityFactor = 0.13 - eased * 0.08;
    productionFactor = 0.86 + Math.sin(phaseProgress * Math.PI) * 0.14;
  } else {
    temperatureFactor = 0.83 - eased * 0.36;
    steamActivityFactor = 0.05 - eased * 0.04;
    productionFactor = 0.76 - eased * 0.5;
  }

  return {
    phaseKey: phase.key,
    phaseLabel: phase.label,
    phaseProgress,
    cycleProgress: normalizedTime / cycleDuration,
    timeSeconds: normalizedTime,
    cycleDuration,
    temperatureFactor: normalize01(temperatureFactor),
    steamActivityFactor: normalize01(steamActivityFactor),
    productionFactor: normalize01(productionFactor),
    systemState: phase.label.toUpperCase(),
  };
}

export function createDigitalTwinOutput({
  mode,
  parameters,
  visualState,
  predictions = {},
  backendData = {},
}) {
  return {
    systemState: mode === 'optimized' ? 'OPTIMIZED' : 'CURRENT',
    selectedMode: mode,
    phase: visualState.simulation?.phaseLabel ?? 'Manual Parameter Response',
    cycleProgress: visualState.simulation
      ? Number((visualState.simulation.cycleProgress * 100).toFixed(1))
      : null,
    inputParameters: parameters,
    digitalTwinCalculated: {
      reservoirTemperature: Number(visualState.effectiveReservoirTemperature.toFixed(1)),
      oilLevel: Number((visualState.oilLevel * 100).toFixed(1)),
      oilFlowRate: Number(visualState.oilFlowRate.toFixed(2)),
      steamFlowRate: Number(visualState.steamFlowRate.toFixed(2)),
      oilMobilityIndex: Number((visualState.mobilityIndex * 100).toFixed(1)),
      thermalIndex: Number((visualState.thermalIndex * 100).toFixed(1)),
      pumpStrokeSpeed: Number(visualState.pumpStrokeSpeed.toFixed(1)),
      rodMovement: visualState.rodMovement,
      pressureState: visualState.pressureRisk,
      flowDirection: visualState.oilFlowDirection,
    },
    aiPredicted: predictions,
    backendDatabase: backendData,
    warnings: visualState.warnings ?? [],
    risks: {
      rodFloatingRisk: visualState.rodFloatingRisk,
      impactLoadingRisk: visualState.impactLoadingRisk,
      pumpUnsettingRisk: visualState.pumpUnsettingRisk,
      rodFailureRisk: visualState.rodFailureRisk,
    },
    riskScores: {
      rodFloatingRisk: Number((visualState.rodFloatingScore * 100).toFixed(1)),
      impactLoadingRisk: Number((visualState.impactLoadingScore * 100).toFixed(1)),
      pumpUnsettingRisk: Number((visualState.pumpUnsettingScore * 100).toFixed(1)),
      rodFailureRisk: Number((visualState.rodFailureScore * 100).toFixed(1)),
    },
  };
}

function readNumericPrediction(predictions, keys) {
  for (const key of keys) {
    const value = Number(predictions?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function readRiskPrediction(predictions, key) {
  const value = predictions?.[key];
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    if (normalized === 'HIGH') return 0.82;
    if (normalized === 'MEDIUM') return 0.52;
    if (normalized === 'LOW') return 0.16;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number > 1 ? normalize01(number / 100) : normalize01(number);
}

function normalizeLiveSimulation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const flowDirection = ['forward', 'reverse', 'stalled'].includes(input.flowDirection)
    ? input.flowDirection
    : ['forward', 'reverse', 'stalled'].includes(input.flow_direction)
      ? input.flow_direction
      : 'forward';

  const rodMovementBehavior = ['normal', 'floating_risk', 'impact_risk'].includes(
    input.rodMovementBehavior,
  )
    ? input.rodMovementBehavior
    : ['normal', 'floating_risk', 'impact_risk'].includes(input.rod_movement_behavior)
      ? input.rod_movement_behavior
      : null;

  return {
    flowSpeed: readUnitInterval(input.flowSpeed ?? input.flow_speed, 'flow'),
    flowDirection,
    temperatureColorValue: readUnitInterval(
      input.temperatureColorValue ?? input.temperature_color_value,
    ),
    pressureIntensity: readUnitInterval(input.pressureIntensity ?? input.pressure_intensity),
    pumpStrokeSpeed: readFiniteNumber(input.pumpStrokeSpeed ?? input.pump_stroke_speed),
    rodMovementBehavior,
    warnings: Array.isArray(input.warnings)
      ? input.warnings.filter((warning) => typeof warning === 'string')
      : [],
  };
}

function readUnitInterval(value, mode = 'unit') {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (mode === 'flow' && number > 1) {
    return normalize01(number / 100);
  }
  return normalize01(number);
}

function readFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function smoothstep(value) {
  const x = normalize01(value);
  return x * x * (3 - 2 * x);
}

function normalize01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}
