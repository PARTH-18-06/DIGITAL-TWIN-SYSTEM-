'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Waves,
} from 'lucide-react';

import {
  DEFAULT_OPERATION,
  PARAMETER_SPECS,
  deriveTwinState,
  normalizeOperation,
} from '@/src/controls.js';
import { createDigitalTwin } from '@/src/digitalTwin.js';

type Mode = 'current' | 'optimized';
type FlowDirection = 'forward' | 'reverse' | 'stalled';
type RodMovementBehavior = 'normal' | 'floating_risk' | 'impact_risk';
type RiskCategory = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DigitalTwinProps {
  well: {
    id: string;
    well_name: string;
    reservoir_temperature: number | null;
    reservoir_pressure: number | null;
  } | null;

  simulation: {
    flow_speed: number;
    flow_direction: FlowDirection;
    temperature_color_value: number;
    pressure_intensity: number;
    pump_stroke_speed: number;
    rod_movement_behavior: RodMovementBehavior;
    warnings: string[];
  } | null;

  optimization: {
    recommendedParameters: {
      steam_volume: number;
      steam_injection_pressure: number;
      soak_time: number;
      production_cutoff: number;
      stroke_length: number;
      rpm_or_spm: number;
      vfd_frequency: number;
    };
    predictions: {
      current: Record<string, number>;
      recommended: Record<string, number>;
    };
  } | null;

  risk: {
    rod_floating: { risk_score: number; category: RiskCategory };
    impact_loading: { risk_score: number; category: RiskCategory };
    pump_unsetting: { risk_score: number; category: RiskCategory };
    rod_failure: { risk_score: number; category: RiskCategory };
  } | null;

  mode: Mode;
}

type Operation = {
  reservoirTemperature: number;
  reservoirPressure: number;
  steamVolume: number;
  injectionPressure: number;
  soakTime: number;
  productionCutoff: number;
  strokeLength: number;
  spm: number;
  vfdFrequency: number;
};

type LiveSimulation = {
  flowSpeed: number | null;
  flowDirection: FlowDirection;
  temperatureColorValue: number | null;
  pressureIntensity: number | null;
  pumpStrokeSpeed: number | null;
  rodMovementBehavior: RodMovementBehavior | null;
  warnings: string[];
};

type PredictionMap = Record<string, number | string>;
type ComparisonState = {
  current: Operation;
  recommended: Operation;
};
type RuntimeState = {
  mode: Mode;
  operation: Operation;
  predictions: PredictionMap;
  backendData: Record<string, unknown>;
  liveSimulation: LiveSimulation | null;
  comparison: ComparisonState;
};
type TwinOutput = {
  systemState?: string;
  selectedMode?: Mode;
  phase?: string;
  cycleProgress?: number | null;
  inputParameters?: Operation;
  digitalTwinCalculated?: Record<string, number | string>;
  aiPredicted?: PredictionMap;
  backendDatabase?: Record<string, unknown>;
  warnings?: string[];
  risks?: Record<string, string>;
  riskScores?: Record<string, number>;
};
type WebMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (input: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>;
};
type WebMcpContext = {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

const riskKeys = [
  ['rodFloatingRisk', 'Rod floating'],
  ['impactLoadingRisk', 'Impact loading'],
  ['pumpUnsettingRisk', 'Pump unsetting'],
  ['rodFailureRisk', 'Rod failure'],
] as const;
const defaultOperation = DEFAULT_OPERATION as Operation;
const recommendedParameterSchema = Object.fromEntries(
  PARAMETER_SPECS.map((spec) => [
    spec.key,
    {
      type: 'number',
      minimum: spec.min,
      maximum: spec.max,
    },
  ]),
);
const deriveTwinStateWithLive = deriveTwinState as (
  parameters: Operation,
  predictions?: PredictionMap,
  simulationSnapshot?: unknown,
  liveSimulation?: LiveSimulation | null,
) => Record<string, unknown>;

export default function DigitalTwin(props: DigitalTwinProps) {
  const { mode, optimization, risk, simulation, well } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const twinRef = useRef<ReturnType<typeof createDigitalTwin> | null>(null);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [twinOutput, setTwinOutput] = useState<TwinOutput | null>(null);
  const derivedState = useMemo(
    () => deriveRuntimeState({ mode, optimization, risk, simulation, well }),
    [mode, optimization, risk, simulation, well],
  );
  const [imperativeState, setImperativeState] = useState<RuntimeState | null>(null);
  const runtimeState = imperativeState ?? derivedState;
  const runtimeRef = useRef(runtimeState);

  useEffect(() => {
    runtimeRef.current = runtimeState;
  }, [runtimeState]);

  const applyExternalPayload = useCallback((payload: unknown) => {
    if (!isRecord(payload)) {
      throw new Error('updateDigitalTwin expects an object payload');
    }

    const previous = runtimeRef.current;
    const targetMode = isRecord(payload.recommendedParameters)
      ? 'optimized'
      : previous.mode;
    const operation = readOperationPayload(payload, previous.operation);
    const predictions = normalizePredictionRecord(payload.predictions);
    const backendData = getBackendData(payload);
    const comparison =
      targetMode === 'optimized'
        ? { ...previous.comparison, recommended: operation }
        : { ...previous.comparison, current: operation };
    const nextState = {
      ...previous,
      mode: targetMode,
      operation,
      predictions,
      backendData,
      comparison,
    };

    setImperativeState(nextState);
    twinRef.current?.setMode(targetMode);
    twinRef.current?.setComparison(comparison);
    const result = twinRef.current?.updateDigitalTwin(operation, {
      predictions,
      backendData,
      liveSimulation: previous.liveSimulation,
    });

    return (result?.output ?? twinRef.current?.getDigitalTwinState() ?? {}) as Record<
      string,
      unknown
    >;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const initialState = runtimeRef.current;
    const twin = createDigitalTwin(containerRef.current, {
      initialOperation: initialState.operation,
      predictions: initialState.predictions,
      backendData: initialState.backendData,
      liveSimulation: initialState.liveSimulation,
      mode: initialState.mode,
      onStateChange: (output: TwinOutput) => setTwinOutput(output),
    });
    twinRef.current = twin;
    twin.setComparison(initialState.comparison);

    const browserWindow = window as Window & {
      digitalTwin?: unknown;
      updateDigitalTwin?: (payload: unknown) => unknown;
      getDigitalTwinState?: () => unknown;
      startDigitalTwinSimulation?: () => unknown;
      pauseDigitalTwinSimulation?: () => unknown;
      resetDigitalTwinSimulation?: () => unknown;
      setDigitalTwinSimulationSpeed?: (speed: number) => unknown;
    };

    browserWindow.digitalTwin = twin;
    browserWindow.updateDigitalTwin = applyExternalPayload;
    browserWindow.getDigitalTwinState = () => twin.getDigitalTwinState();
    browserWindow.startDigitalTwinSimulation = () => twin.startSimulation();
    browserWindow.pauseDigitalTwinSimulation = () => twin.pauseSimulation();
    browserWindow.resetDigitalTwinSimulation = () => twin.resetSimulation();
    browserWindow.setDigitalTwinSimulationSpeed = (speed: number) =>
      twin.setSimulationSpeed(speed);

    return () => {
      twin.dispose();
      twinRef.current = null;
      delete browserWindow.digitalTwin;
      delete browserWindow.updateDigitalTwin;
      delete browserWindow.getDigitalTwinState;
      delete browserWindow.startDigitalTwinSimulation;
      delete browserWindow.pauseDigitalTwinSimulation;
      delete browserWindow.resetDigitalTwinSimulation;
      delete browserWindow.setDigitalTwinSimulationSpeed;
    };
  }, [applyExternalPayload]);

  useEffect(() => {
    const twin = twinRef.current;
    if (!twin) return;

    twin.setMode(runtimeState.mode);
    twin.setComparison(runtimeState.comparison);
    const result = twin.updateDigitalTwin(runtimeState.operation, {
      predictions: runtimeState.predictions,
      backendData: runtimeState.backendData,
      liveSimulation: runtimeState.liveSimulation,
    });
    setTwinOutput(result.output as TwinOutput);
  }, [runtimeState]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMcpContext })
      .modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    const tools: WebMcpTool[] = [
      {
        name: 'read_digital_twin_state',
        title: 'Read digital twin state',
        description:
          'Return current/optimized inputs, live simulation status, risk signals, and calculated Digital Twin output.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute() {
          return (twinRef.current?.getDigitalTwinState() ?? {}) as Record<
            string,
            unknown
          >;
        },
      },
      {
        name: 'apply_recommended_operation',
        title: 'Apply recommended operation',
        description:
          'Apply backend-style recommendedParameters and optional predictions to the AI Recommended Operation view.',
        inputSchema: {
          type: 'object',
          properties: {
            recommendedParameters: {
              type: 'object',
              properties: recommendedParameterSchema,
              additionalProperties: true,
            },
            predictions: {
              type: 'object',
              additionalProperties: {
                anyOf: [{ type: 'number' }, { type: 'string' }],
              },
            },
            backendData: {
              type: 'object',
              additionalProperties: true,
            },
          },
          required: ['recommendedParameters'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!isRecord(input) || !isRecord(input.recommendedParameters)) {
            throw new Error('recommendedParameters is required');
          }

          return applyExternalPayload(input);
        },
      },
    ];

    tools.forEach((tool) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch((error: unknown) => console.error(error));
      } catch (error) {
        console.error(error);
      }
    });

    return () => lifecycle.abort();
  }, [applyExternalPayload]);

  const fallbackVisualState = useMemo(
    () =>
      deriveTwinStateWithLive(
        runtimeState.operation,
        runtimeState.predictions,
        null,
        runtimeState.liveSimulation,
      ),
    [runtimeState],
  );
  const calculated = twinOutput?.digitalTwinCalculated ?? {};
  const warnings = twinOutput?.warnings ?? runtimeState.liveSimulation?.warnings ?? [];
  const oilLevel = readNumber(
    calculated.oilLevel,
    readNumber(fallbackVisualState.oilLevel, 0) * 100,
  );
  const thermalIndex = readNumber(
    calculated.thermalIndex,
    readNumber(fallbackVisualState.thermalIndex, 0) * 100,
  );
  const oilFlowRate = readNumber(
    calculated.oilFlowRate,
    readNumber(fallbackVisualState.oilFlowRate, 0),
  );
  const pumpStrokeSpeed = readNumber(
    calculated.pumpStrokeSpeed,
    readNumber(fallbackVisualState.pumpStrokeSpeed, 0),
  );
  const phase = twinOutput?.phase ?? 'Manual Parameter Response';
  const cycleProgress = Number(twinOutput?.cycleProgress ?? 0);
  const statusLabel = simulation ? simulation.flow_direction : 'idle';

  function handleStartSimulation() {
    const result = twinRef.current?.startSimulation();
    if (result?.output) setTwinOutput(result.output as TwinOutput);
    setSimulationRunning(true);
  }

  function handlePauseSimulation() {
    const result = twinRef.current?.pauseSimulation();
    if (result?.output) setTwinOutput(result.output as TwinOutput);
    setSimulationRunning(false);
  }

  function handleResetSimulation() {
    const result = twinRef.current?.resetSimulation();
    if (result?.output) setTwinOutput(result.output as TwinOutput);
    setSimulationRunning(false);
  }

  function handleSpeedChange(value: number) {
    const speed = Math.min(6, Math.max(0.25, value));
    setSimulationSpeed(speed);
    const result = twinRef.current?.setSimulationSpeed(speed);
    if (result?.output) setTwinOutput(result.output as TwinOutput);
  }

  return (
    <section className="dt-embed" aria-label="3D digital twin">
      <div className="dt-embed-head">
        <div className="dt-embed-title">
          <span className="dt-embed-mark">
            <Waves aria-hidden="true" />
          </span>
          <div>
            <p>{well?.well_name ?? 'No well selected'}</p>
            <h2>Three.js Digital Twin</h2>
          </div>
        </div>
        <div className={`dt-embed-mode dt-embed-mode-${runtimeState.mode}`}>
          {runtimeState.mode === 'optimized' ? 'AI optimized' : 'Current'}
        </div>
      </div>

      <div className="dt-embed-canvas-wrap">
        <div ref={containerRef} className="dt-embed-canvas" />

        <div className="dt-embed-overlay dt-embed-overlay-top">
          <Metric label="Thermal" value={`${Math.round(thermalIndex)}%`} />
          <Metric label="Oil level" value={`${Math.round(oilLevel)}%`} />
          <Metric label="Flow" value={`${oilFlowRate.toFixed(1)} bpd`} />
        </div>

        <div className="dt-embed-overlay dt-embed-overlay-bottom">
          <div className="dt-flow-badge">
            <Gauge aria-hidden="true" />
            <span>{statusLabel}</span>
          </div>
          <span>{pumpStrokeSpeed.toFixed(1)} spm</span>
          <span>{phase}</span>
        </div>
      </div>

      <div className="dt-embed-controls">
        <div className="dt-cycle">
          <span className="dt-cycle-track">
            <span
              className="dt-cycle-fill"
              style={{ width: `${Math.min(100, Math.max(0, cycleProgress))}%` }}
            />
          </span>
          <strong>{Math.round(cycleProgress)}%</strong>
        </div>

        <div className="dt-embed-action-row">
          <button
            type="button"
            className="dt-icon-button"
            aria-label="Start CSS timeline"
            title="Start CSS timeline"
            onClick={handleStartSimulation}
          >
            <Play aria-hidden="true" />
          </button>
          <button
            type="button"
            className="dt-icon-button"
            aria-label="Pause CSS timeline"
            title="Pause CSS timeline"
            onClick={handlePauseSimulation}
          >
            <Pause aria-hidden="true" />
          </button>
          <button
            type="button"
            className="dt-icon-button"
            aria-label="Reset CSS timeline"
            title="Reset CSS timeline"
            onClick={handleResetSimulation}
          >
            <RotateCcw aria-hidden="true" />
          </button>
          <label className="dt-speed">
            <span>
              <Timer aria-hidden="true" />
              {simulationSpeed.toFixed(2)}x
            </span>
            <input
              aria-label="Simulation speed"
              type="range"
              min="0.25"
              max="6"
              step="0.25"
              value={simulationSpeed}
              onChange={(event) => handleSpeedChange(Number(event.target.value))}
            />
          </label>
          <span className={`dt-running-state ${simulationRunning ? 'is-running' : ''}`}>
            {simulationRunning ? 'Running' : 'Paused'}
          </span>
        </div>
      </div>

      <div className="dt-risk-strip" aria-label="Risk scores">
        {riskKeys.map(([key, label]) => (
          <RiskPill
            key={key}
            label={label}
            category={readRiskCategory(twinOutput?.risks?.[key])}
            score={readNumber(
              twinOutput?.riskScores?.[key],
              readNumber(fallbackVisualState[key.replace('Risk', 'Score')], 0) *
                100,
            )}
          />
        ))}
      </div>

      {warnings.length > 0 ? (
        <output className="dt-embed-warnings">
          <AlertTriangle aria-hidden="true" />
          <span>{warnings.slice(0, 2).join(' | ')}</span>
        </output>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="dt-embed-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RiskPill({
  category,
  label,
  score,
}: {
  category: RiskCategory;
  label: string;
  score: number;
}) {
  return (
    <div className={`dt-risk-pill dt-risk-pill-${category.toLowerCase()}`}>
      <span>{label}</span>
      <strong>{category}</strong>
      <small>{Math.round(score)}%</small>
    </div>
  );
}

function deriveRuntimeState(props: DigitalTwinProps): RuntimeState {
  const comparison = deriveComparison(props);
  const operation =
    props.mode === 'optimized' ? comparison.recommended : comparison.current;
  const predictions = derivePredictions(props, props.mode);

  return {
    mode: props.mode,
    operation,
    predictions,
    backendData: {
      wellId: props.well?.id ?? null,
      wellName: props.well?.well_name ?? null,
    },
    liveSimulation: normalizeLiveSimulation(props.simulation),
    comparison,
  };
}

function deriveComparison(props: DigitalTwinProps): ComparisonState {
  const current = normalizeOperation(
    {
      ...defaultOperation,
      reservoirTemperature:
        props.well?.reservoir_temperature ?? defaultOperation.reservoirTemperature,
      reservoirPressure:
        props.well?.reservoir_pressure ?? defaultOperation.reservoirPressure,
      spm: props.simulation?.pump_stroke_speed ?? defaultOperation.spm,
    },
    defaultOperation,
  ) as Operation;

  const recommended = props.optimization?.recommendedParameters;
  const optimized = recommended
    ? (normalizeOperation(
        {
          ...current,
          steamVolume: recommended.steam_volume,
          injectionPressure: recommended.steam_injection_pressure,
          soakTime: recommended.soak_time,
          productionCutoff: recommended.production_cutoff,
          strokeLength: recommended.stroke_length,
          spm: recommended.rpm_or_spm,
          vfdFrequency: recommended.vfd_frequency,
        },
        current,
      ) as Operation)
    : current;

  return { current, recommended: optimized };
}

function derivePredictions(props: DigitalTwinProps, mode: Mode): PredictionMap {
  const predictionSource =
    mode === 'optimized'
      ? props.optimization?.predictions.recommended
      : props.optimization?.predictions.current;
  const predictions = normalizePredictionRecord(predictionSource);
  const riskPredictions = normalizeRiskProps(props.risk);

  if (mode === 'current') {
    return { ...predictions, ...riskPredictions };
  }

  return {
    ...riskPredictions,
    ...predictions,
  };
}

function normalizeLiveSimulation(
  simulation: DigitalTwinProps['simulation'],
): LiveSimulation | null {
  if (!simulation) return null;

  return {
    flowSpeed: normalizeUnitInterval(simulation.flow_speed, true),
    flowDirection: simulation.flow_direction,
    temperatureColorValue: normalizeUnitInterval(simulation.temperature_color_value),
    pressureIntensity: normalizeUnitInterval(simulation.pressure_intensity),
    pumpStrokeSpeed: readFiniteNumber(simulation.pump_stroke_speed),
    rodMovementBehavior: simulation.rod_movement_behavior,
    warnings: simulation.warnings.filter((warning) => warning.trim().length > 0),
  };
}

function normalizeRiskProps(risk: DigitalTwinProps['risk']): PredictionMap {
  if (!risk) return {};

  return {
    rodFloatingRisk: normalizeRiskScore(risk.rod_floating),
    impactLoadingRisk: normalizeRiskScore(risk.impact_loading),
    pumpUnsettingRisk: normalizeRiskScore(risk.pump_unsetting),
    rodFailureRisk: normalizeRiskScore(risk.rod_failure),
  };
}

function normalizeRiskScore(risk: { risk_score: number; category: RiskCategory }) {
  const score = normalizeUnitInterval(risk.risk_score, true);
  if (score !== null) return score;
  if (risk.category === 'HIGH') return 0.82;
  if (risk.category === 'MEDIUM') return 0.52;
  return 0.16;
}

function readOperationPayload(payload: Record<string, unknown>, fallback: Operation) {
  const source = isRecord(payload.recommendedParameters)
    ? payload.recommendedParameters
    : isRecord(payload.parameters)
      ? payload.parameters
      : payload;

  return normalizeOperation(
    {
      ...fallback,
      reservoirTemperature: readFirstNumber(source, [
        'reservoirTemperature',
        'reservoir_temperature',
      ]),
      reservoirPressure: readFirstNumber(source, [
        'reservoirPressure',
        'reservoir_pressure',
      ]),
      steamVolume: readFirstNumber(source, ['steamVolume', 'steam_volume']),
      injectionPressure: readFirstNumber(source, [
        'injectionPressure',
        'steam_injection_pressure',
        'injection_pressure',
      ]),
      soakTime: readFirstNumber(source, ['soakTime', 'soak_time']),
      productionCutoff: readFirstNumber(source, [
        'productionCutoff',
        'production_cutoff',
      ]),
      strokeLength: readFirstNumber(source, ['strokeLength', 'stroke_length']),
      spm: readFirstNumber(source, ['spm', 'rpm_or_spm', 'pump_stroke_speed']),
      vfdFrequency: readFirstNumber(source, ['vfdFrequency', 'vfd_frequency']),
    },
    fallback,
  ) as Operation;
}

function normalizePredictionRecord(value: unknown): PredictionMap {
  if (!isRecord(value)) return {};

  const output: PredictionMap = {};
  const mapping: Record<string, string> = {
    oil_production: 'oilProduction',
    oilProduction: 'oilProduction',
    predicted_oil_production: 'oilProduction',
    predictedOilProduction: 'oilProduction',
    production: 'oilProduction',
    sor: 'sor',
    steam_oil_ratio: 'sor',
    energy_per_barrel: 'energyPerBarrel',
    energyPerBarrel: 'energyPerBarrel',
    rod_floating: 'rodFloatingRisk',
    rodFloatingRisk: 'rodFloatingRisk',
    rod_floating_risk: 'rodFloatingRisk',
    impact_loading: 'impactLoadingRisk',
    impactLoadingRisk: 'impactLoadingRisk',
    impact_loading_risk: 'impactLoadingRisk',
    pump_unsetting: 'pumpUnsettingRisk',
    pumpUnsettingRisk: 'pumpUnsettingRisk',
    pump_unsetting_risk: 'pumpUnsettingRisk',
    rod_failure: 'rodFailureRisk',
    rodFailureRisk: 'rodFailureRisk',
    rod_failure_risk: 'rodFailureRisk',
  };

  Object.entries(value).forEach(([key, entryValue]) => {
    if (typeof entryValue !== 'number' && typeof entryValue !== 'string') return;
    output[mapping[key] ?? key] = entryValue;
  });

  return output;
}

function readFirstNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const number = readFiniteNumber(source[key]);
    if (number !== null) return number;
  }

  return undefined;
}

function readNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeUnitInterval(value: unknown, allowPercent = false) {
  const number = readFiniteNumber(value);
  if (number === null) return null;
  const normalized = allowPercent && number > 1 ? number / 100 : number;
  return Math.min(1, Math.max(0, normalized));
}

function readRiskCategory(value: unknown): RiskCategory {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW' ? value : 'LOW';
}

function getBackendData(payload: Record<string, unknown>) {
  const data = payload.backendData ?? payload.database ?? {};
  return isRecord(data) ? data : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
