'use client';

import type { ComponentType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CloudCog,
  Flame,
  Gauge,
  GitCompare,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
  Thermometer,
  Timer,
  Waves,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DEFAULT_OPERATION,
  MODE_LABELS,
  PARAMETER_SPECS,
  PREDICTION_LABELS,
  deriveTwinState,
  formatValue,
  normalizeOperation,
  parseBackendPayload,
  summarizeTwinState,
  updateOperationValue,
} from '@/src/controls.js';
import { createDigitalTwin } from '@/src/digitalTwin.js';
import testData from '@/test-data.json';

type Mode = 'current' | 'optimized';
type Operation = typeof DEFAULT_OPERATION;
type ParameterKey = keyof Operation;
type PredictionMap = Record<string, number | string>;
type ToolResult = Record<string, unknown>;
type TwinOutput = {
  systemState?: string;
  selectedMode?: string;
  phase?: string;
  cycleProgress?: number | null;
  inputParameters?: Operation;
  digitalTwinCalculated?: Record<string, number | string>;
  aiPredicted?: PredictionMap;
  backendDatabase?: Record<string, unknown>;
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
  execute: (input: unknown) => ToolResult | Promise<ToolResult>;
};
type WebMcpContext = {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

const parameterIcons: Record<string, ComponentType<{ className?: string }>> = {
  reservoirTemperature: Thermometer,
  reservoirPressure: Gauge,
  steamVolume: Flame,
  injectionPressure: Zap,
  soakTime: Timer,
  productionCutoff: Gauge,
  strokeLength: Ruler,
  spm: Activity,
  vfdFrequency: SlidersHorizontal,
};

const riskKeys = [
  'rodFloatingRisk',
  'impactLoadingRisk',
  'pumpUnsettingRisk',
  'rodFailureRisk',
] as const;

const initialCurrent = normalizeOperation(
  testData.currentOperation ?? DEFAULT_OPERATION,
) as Operation;
const initialOptimized = normalizeOperation(
  testData.aiRecommendedOperation ?? testData.currentOperation ?? DEFAULT_OPERATION,
) as Operation;
const initialPredictions = (testData.backendPayload?.predictions ?? {}) as PredictionMap;
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

export default function Home() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const twinRef = useRef<ReturnType<typeof createDigitalTwin> | null>(null);
  const [mode, setMode] = useState<Mode>('current');
  const [operations, setOperations] = useState<Record<Mode, Operation>>({
    current: initialCurrent,
    optimized: initialOptimized,
  });
  const [predictions, setPredictions] = useState<PredictionMap>(initialPredictions);
  const [apiStatus, setApiStatus] = useState('Development mock data loaded');
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationSpeed, setSimulationSpeedState] = useState(1);
  const [twinOutput, setTwinOutput] = useState<TwinOutput | null>(null);
  const operationsRef = useRef(operations);
  const predictionsRef = useRef(predictions);
  const modeRef = useRef<Mode>(mode);

  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);

  useEffect(() => {
    predictionsRef.current = predictions;
  }, [predictions]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!containerRef.current) return;

    const twin = createDigitalTwin(containerRef.current, {
      initialOperation: operationsRef.current.current,
      predictions: initialPredictions,
      mode: 'current',
      onStateChange: (output: TwinOutput) => setTwinOutput(output),
    });
    twinRef.current = twin;

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
    browserWindow.updateDigitalTwin = (payload: unknown) => {
      if (!isRecord(payload)) {
        throw new Error('updateDigitalTwin expects a parameter object or backend payload');
      }

      const isRecommendedPayload = isRecord(payload.recommendedParameters);
      const targetMode = isRecommendedPayload ? 'optimized' : modeRef.current;
      const fallback = operationsRef.current[targetMode];
      const parsed = parseBackendPayload(payload, fallback);
      const nextParameters = parsed.parameters as Operation;
      const nextPredictions = (parsed.predictions ?? predictionsRef.current) as PredictionMap;

      setOperations((previous) => ({
        ...previous,
        [targetMode]: nextParameters,
      }));
      setPredictions(nextPredictions);
      setMode(targetMode);
      setApiStatus(
        isRecommendedPayload
          ? 'Backend AI recommendation applied'
          : 'Direct updateDigitalTwin parameters applied',
      );

      twin.setMode(targetMode);
      twin.updateDigitalTwin(nextParameters, {
        predictions: targetMode === 'optimized' ? nextPredictions : {},
        backendData: getBackendData(payload),
      });

      return twin.getDigitalTwinState();
    };
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
  }, []);

  useEffect(() => {
    const twin = twinRef.current;
    if (!twin) return;

    twin.setMode(mode);
    twin.setComparison({
      current: operations.current,
      recommended: operations.optimized,
    });
    const result = twin.updateDigitalTwin(operations[mode], {
      predictions: mode === 'optimized' ? predictions : {},
    });
    setTwinOutput(result.output as TwinOutput);
  }, [mode, operations, predictions]);

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
          'Return current/optimized inputs, AI predictions, simulation phase, and calculated Digital Twin output.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute() {
          return (twinRef.current?.getDigitalTwinState() ?? {
            mode: modeRef.current,
            currentOperation: operationsRef.current.current,
            aiRecommendedOperation: operationsRef.current.optimized,
            predictions: predictionsRef.current,
          }) as ToolResult;
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
              additionalProperties: false,
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

          const parsed = parseBackendPayload(input, operationsRef.current.optimized);
          const nextParameters = parsed.parameters as Operation;
          const nextPredictions = parsed.predictions as PredictionMap;

          setOperations((previous) => ({
            ...previous,
            optimized: nextParameters,
          }));
          setPredictions(nextPredictions);
          setMode('optimized');
          setApiStatus('WebMCP recommended operation applied');
          twinRef.current?.setMode('optimized');
          twinRef.current?.updateDigitalTwin(nextParameters, {
            predictions: nextPredictions,
            backendData: getBackendData(input),
          });

          return (twinRef.current?.getDigitalTwinState() ?? {}) as ToolResult;
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
  }, []);

  const selectedOperation = operations[mode];
  const selectedState = useMemo(
    () =>
      deriveTwinState(
        selectedOperation,
        mode === 'optimized' ? predictions : {},
      ),
    [mode, selectedOperation, predictions],
  );
  const selectedSummary = summarizeTwinState(selectedState);
  const currentState = deriveTwinState(operations.current);
  const optimizedState = deriveTwinState(operations.optimized, predictions);
  const currentSummary = summarizeTwinState(currentState);
  const optimizedSummary = summarizeTwinState(optimizedState);
  const calculated = twinOutput?.digitalTwinCalculated ?? {};
  const outputRisks = twinOutput?.risks ?? {};
  const outputRiskScores = twinOutput?.riskScores ?? {};
  const displayThermal = getOutputNumber(
    calculated,
    'thermalIndex',
    selectedSummary.thermalIndex,
  );
  const displayMobility = getOutputNumber(
    calculated,
    'oilMobilityIndex',
    selectedSummary.mobilityIndex,
  );
  const displayOilLevel = getOutputNumber(
    calculated,
    'oilLevel',
    selectedSummary.oilLevel,
  );
  const displayPhase = twinOutput?.phase ?? 'Manual Parameter Response';
  const displayCycleProgress = Number(twinOutput?.cycleProgress ?? 0);

  function handleParameterChange(key: ParameterKey, value: number) {
    setOperations((previous) => ({
      ...previous,
      [mode]: updateOperationValue(previous[mode], key, value) as Operation,
    }));
  }

  function handleApplyAiOptimization() {
    const parsed = parseBackendPayload(testData.backendPayload, operations.current);
    setOperations((previous) => ({
      ...previous,
      optimized: parsed.parameters as Operation,
    }));
    setPredictions(parsed.predictions as PredictionMap);
    setMode('optimized');
    setApiStatus('Sample backend AI payload applied');
  }

  function handleStartSimulation() {
    const result = twinRef.current?.startSimulation();
    if (result?.output) setTwinOutput(result.output as TwinOutput);
    setSimulationRunning(true);
    setApiStatus('CSS timeline running');
  }

  function handlePauseSimulation() {
    const result = twinRef.current?.pauseSimulation();
    if (result?.output) setTwinOutput(result.output as TwinOutput);
    setSimulationRunning(false);
    setApiStatus('CSS timeline paused');
  }

  function handleResetCycle() {
    const result = twinRef.current?.resetSimulation();
    if (result?.output) setTwinOutput(result.output as TwinOutput);
    setSimulationRunning(false);
    setApiStatus('CSS timeline reset to steam injection');
  }

  function handleSimulationSpeedChange(value: number) {
    const speed = Math.min(6, Math.max(0.25, value));
    setSimulationSpeedState(speed);
    const result = twinRef.current?.setSimulationSpeed(speed);
    if (result?.output) setTwinOutput(result.output as TwinOutput);
  }

  function handleResetAll() {
    setOperations({
      current: initialCurrent,
      optimized: initialOptimized,
    });
    setPredictions(initialPredictions);
    setMode('current');
    setSimulationRunning(false);
    setSimulationSpeedState(1);
    twinRef.current?.setSimulationSpeed(1);
    const result = twinRef.current?.resetSimulation({ disable: true });
    if (result?.output) setTwinOutput(result.output as TwinOutput);
    setApiStatus('Development mock data loaded');
  }

  return (
    <main className="dt-app">
      <header className="dt-topbar">
        <div className="dt-brand">
          <span className="dt-mark">
            <Waves aria-hidden="true" />
          </span>
          <div>
            <p>SIH CSS + SRP</p>
            <h1>Baghewala Well-to-Surface Digital Twin</h1>
          </div>
        </div>

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as Mode)}
          className="dt-tabs"
        >
          <TabsList className="dt-tabs-list">
            <TabsTrigger value="current" className="dt-tab">
              <Activity aria-hidden="true" />
              Current
            </TabsTrigger>
            <TabsTrigger value="optimized" className="dt-tab">
              <GitCompare aria-hidden="true" />
              AI Optimized
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="dt-actions">
          <Button type="button" variant="outline" onClick={handleResetAll}>
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
          <Button type="button" onClick={handleApplyAiOptimization}>
            <CloudCog aria-hidden="true" />
            Apply AI Optimization
          </Button>
        </div>
      </header>

      <section className="dt-statusbar" aria-label="Selected operating state">
        <Badge className="dt-mode-badge">{MODE_LABELS[mode]}</Badge>
        <span>{apiStatus}</span>
        <span>Phase: {displayPhase}</span>
        <span>Visual representation only, not CFD or field-calibrated simulation</span>
      </section>

      <section className="dt-workspace">
        <section className="dt-viewport-panel" aria-label="3D digital twin viewport">
          <div ref={containerRef} className="dt-viewport" />

          <div className="dt-viewport-overlay">
            <div>
              <p>Thermal index</p>
              <strong>{Math.round(displayThermal)}%</strong>
            </div>
            <div>
              <p>Oil mobility index</p>
              <strong>{Math.round(displayMobility)}%</strong>
            </div>
            <div>
              <p>Wellbore liquid level</p>
              <strong>{Math.round(displayOilLevel)}%</strong>
            </div>
          </div>

          <div className="dt-risk-row" aria-label="Equipment risk indicators">
            {riskKeys.map((key) => (
              <RiskPill
                key={key}
                label={riskLabel(key)}
                level={outputRisks[key] ?? selectedState[key]}
                score={getOutputNumber(
                  outputRiskScores,
                  key,
                  riskScoreFromState(selectedState, key) * 100,
                )}
              />
            ))}
          </div>
        </section>

        <aside className="dt-side">
          <section className="dt-panel">
            <div className="dt-panel-heading">
              <div>
                <p>CSS simulation timeline</p>
                <h2>{displayPhase}</h2>
              </div>
              <Badge variant={simulationRunning ? 'default' : 'outline'}>
                {simulationRunning ? 'Running' : 'Paused'}
              </Badge>
            </div>

            <div className="dt-cycle">
              <span className="dt-cycle-track">
                <span
                  className="dt-cycle-fill"
                  style={{ width: `${Math.min(100, Math.max(0, displayCycleProgress))}%` }}
                />
              </span>
              <strong>{Math.round(displayCycleProgress)}%</strong>
            </div>

            <div className="dt-sim-actions">
              <Button type="button" onClick={handleStartSimulation}>
                <Play aria-hidden="true" />
                Start
              </Button>
              <Button type="button" variant="outline" onClick={handlePauseSimulation}>
                <Pause aria-hidden="true" />
                Pause
              </Button>
              <Button type="button" variant="outline" onClick={handleResetCycle}>
                <RotateCcw aria-hidden="true" />
                Reset Cycle
              </Button>
            </div>

            <div className="dt-control dt-speed-control">
              <span className="dt-control-meta">
                <span>
                  <Timer aria-hidden="true" />
                  Simulation speed
                </span>
                <strong>{simulationSpeed.toFixed(2)}x</strong>
              </span>
              <Slider
                min={0.25}
                max={6}
                step={0.25}
                value={[simulationSpeed]}
                onValueChange={(nextValue) =>
                  handleSimulationSpeedChange(getSliderNumber(nextValue))
                }
              />
            </div>
          </section>

          <section className="dt-panel">
            <div className="dt-panel-heading">
              <div>
                <p>Operating parameters</p>
                <h2>{MODE_LABELS[mode]}</h2>
              </div>
              <Badge variant="outline">API names locked</Badge>
            </div>

            <div className="dt-control-list">
              {PARAMETER_SPECS.map((spec) => {
                const Icon = parameterIcons[spec.key] ?? Gauge;
                const key = spec.key as ParameterKey;
                const value = selectedOperation[key];

                return (
                  <label className="dt-control" key={spec.key}>
                    <span className="dt-control-meta">
                      <span>
                        <Icon aria-hidden="true" />
                        {spec.label}
                      </span>
                      <strong>{formatValue(value, spec)}</strong>
                    </span>
                    <span className="dt-control-inputs">
                      <Slider
                        min={spec.min}
                        max={spec.max}
                        step={spec.step}
                        value={[value]}
                        onValueChange={(nextValue) =>
                          handleParameterChange(key, getSliderNumber(nextValue))
                        }
                      />
                      <input
                        aria-label={spec.label}
                        type="number"
                        min={spec.min}
                        max={spec.max}
                        step={spec.step}
                        value={value}
                        onChange={(event) =>
                          handleParameterChange(key, Number(event.target.value))
                        }
                      />
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="dt-panel">
            <div className="dt-panel-heading">
              <div>
                <p>Digital Twin output</p>
                <h2>Calculated state</h2>
              </div>
              <Badge variant="secondary">{twinOutput?.systemState ?? 'CURRENT'}</Badge>
            </div>

            <div className="dt-output-grid">
              <OutputRow
                label="Reservoir temperature"
                value={`${getOutputNumber(calculated, 'reservoirTemperature', selectedOperation.reservoirTemperature).toFixed(1)} C`}
              />
              <OutputRow
                label="Oil level"
                value={`${getOutputNumber(calculated, 'oilLevel', selectedSummary.oilLevel).toFixed(1)}%`}
              />
              <OutputRow
                label="Oil flow rate"
                value={`${getOutputNumber(calculated, 'oilFlowRate', selectedState.oilFlowRate).toFixed(2)} bpd`}
              />
              <OutputRow
                label="Steam flow rate"
                value={`${getOutputNumber(calculated, 'steamFlowRate', selectedState.steamFlowRate).toFixed(1)}`}
              />
              <OutputRow
                label="Rod movement"
                value={String(calculated.rodMovement ?? selectedState.rodMovement)}
              />
              <OutputRow
                label="Pressure state"
                value={String(calculated.pressureState ?? selectedState.pressureRisk)}
              />
            </div>
          </section>

          <section className="dt-panel">
            <div className="dt-panel-heading">
              <div>
                <p>Current vs optimized</p>
                <h2>Before / after view</h2>
              </div>
              <Badge variant="secondary">AI-ready</Badge>
            </div>

            <div className="dt-compare-grid">
              <CompareRow
                label="Thermal index"
                before={`${currentSummary.thermalIndex}%`}
                after={`${optimizedSummary.thermalIndex}%`}
              />
              <CompareRow
                label="Oil mobility index"
                before={`${currentSummary.mobilityIndex}%`}
                after={`${optimizedSummary.mobilityIndex}%`}
              />
              <CompareRow
                label="Oil level"
                before={`${currentSummary.oilLevel}%`}
                after={`${optimizedSummary.oilLevel}%`}
              />
              <CompareRow
                label="Production flow"
                before={`${currentState.oilFlowRate.toFixed(1)} bpd`}
                after={`${optimizedState.oilFlowRate.toFixed(1)} bpd`}
              />
              <CompareRow
                label="Rod floating"
                before={currentSummary.rodFloatingRisk}
                after={optimizedSummary.rodFloatingRisk}
              />
              <CompareRow
                label="Impact loading"
                before={currentSummary.impactLoadingRisk}
                after={optimizedSummary.impactLoadingRisk}
              />
            </div>
          </section>

          <section className="dt-panel">
            <div className="dt-panel-heading">
              <div>
                <p>AI output channel</p>
                <h2>Prediction payload</h2>
              </div>
              <AlertTriangle aria-hidden="true" className="dt-warning-icon" />
            </div>

            <div className="dt-predictions">
              {Object.entries(PREDICTION_LABELS).map(([key, meta]) => (
                <PredictionRow
                  key={key}
                  label={meta.label}
                  unit={meta.unit}
                  value={predictions[key]}
                  percent={riskKeys.includes(key as (typeof riskKeys)[number])}
                />
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function RiskPill({
  label,
  level,
  score,
}: {
  label: string;
  level: string;
  score: number;
}) {
  return (
    <div className={`dt-risk dt-risk-${level.toLowerCase()}`}>
      <span>{label}</span>
      <strong>{level}</strong>
      <small>{Math.round(score)}%</small>
    </div>
  );
}

function CompareRow({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div className="dt-compare-row">
      <span>{label}</span>
      <strong>{before}</strong>
      <strong>{after}</strong>
    </div>
  );
}

function OutputRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="dt-output-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PredictionRow({
  label,
  value,
  unit,
  percent = false,
}: {
  label: string;
  value?: number | string;
  unit: string;
  percent?: boolean;
}) {
  const numeric = Number(value);
  const hasNumericValue = Number.isFinite(numeric);
  const displayValue = hasNumericValue
    ? percent
      ? `${Math.round(numeric > 1 ? numeric : numeric * 100)}%`
      : `${numeric.toFixed(numeric % 1 === 0 ? 0 : 2)}${unit ? ` ${unit}` : ''}`
    : String(value ?? 'Pending');

  return (
    <div className="dt-prediction-row">
      <span>{label}</span>
      <strong>{displayValue}</strong>
    </div>
  );
}

function getSliderNumber(value: number | readonly number[]) {
  return Number(Array.isArray(value) ? value[0] : value);
}

function getOutputNumber(
  source: Record<string, number | string>,
  key: string,
  fallback: number,
) {
  const value = Number(source[key]);
  return Number.isFinite(value) ? value : fallback;
}

function riskScoreFromState(state: Record<string, unknown>, key: string) {
  const scoreKey = key.replace('Risk', 'Score');
  const value = Number(state[scoreKey]);
  return Number.isFinite(value) ? value : 0;
}

function riskLabel(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(' Risk', ' risk').toUpperCase();
}

function getBackendData(payload: Record<string, unknown>) {
  const data = payload.backendData ?? payload.database ?? {};
  return isRecord(data) ? data : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
