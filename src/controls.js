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
  rodFailureRisk: { label: 'Rod failure risk', unit: '%' },
};

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

export function deriveTwinState(parameters = DEFAULT_OPERATION, predictions = {}) {
  const operation = normalizeOperation(parameters);
  const steamNorm = normalize01((operation.steamVolume - 200) / 1600);
  const tempNorm = normalize01((operation.reservoirTemperature - 40) / 55);
  const pressureNorm = normalize01((operation.reservoirPressure - 10) / 70);
  const injectionNorm = normalize01((operation.injectionPressure - 8) / 32);
  const soakNorm = normalize01((operation.soakTime - 4) / 68);
  const pumpNorm = normalize01((operation.spm - 3) / 13);
  const vfdNorm = normalize01((operation.vfdFrequency - 25) / 35);
  const strokeNorm = normalize01((operation.strokeLength - 36) / 60);

  const thermalIndex = normalize01(
    tempNorm * 0.55 + steamNorm * 0.3 + injectionNorm * 0.08 + soakNorm * 0.07,
  );
  const mobilityIndex = normalize01(
    0.18 + thermalIndex * 0.62 + pressureNorm * 0.08 - pumpNorm * 0.05,
  );
  const viscosityIndex = normalize01(1 - mobilityIndex);
  const pumpDuty = normalize01(pumpNorm * 0.68 + vfdNorm * 0.22 + strokeNorm * 0.1);
  const heatRadius = 0.8 + thermalIndex * 2.4;
  const oilFlowSpeed = 0.32 + mobilityIndex * 1.45 + pumpDuty * 0.55;
  const steamFlowSpeed = 0.26 + steamNorm * 1.4 + injectionNorm * 0.55;
  const strokeAmplitude = 0.24 + strokeNorm * 0.58;

  const predictedRodRisk =
    Number.isFinite(Number(predictions.rodFailureRisk))
      ? normalize01(Number(predictions.rodFailureRisk) * 7)
      : null;

  const rodFloatingScore = normalize01(
    predictedRodRisk ??
      (pumpDuty * 0.52 + viscosityIndex * 0.36 + pressureNorm * 0.08 - thermalIndex * 0.12),
  );
  const impactLoadingScore = normalize01(
    viscosityIndex * 0.46 + pumpDuty * 0.38 + strokeNorm * 0.16 - thermalIndex * 0.08,
  );

  return {
    parameters: operation,
    thermalIndex,
    mobilityIndex,
    viscosityIndex,
    pumpDuty,
    heatRadius,
    oilFlowSpeed,
    steamFlowSpeed,
    strokeAmplitude,
    strokeRate: operation.spm,
    vfdNorm,
    rodFloatingScore,
    impactLoadingScore,
    rodFloatingRisk: riskLevel(rodFloatingScore),
    impactLoadingRisk: riskLevel(impactLoadingScore),
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
    pumpDuty: Math.round(state.pumpDuty * 100),
    rodFloatingRisk: state.rodFloatingRisk,
    impactLoadingRisk: state.impactLoadingRisk,
  };
}

function normalize01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}
