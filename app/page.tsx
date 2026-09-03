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
type PredictionMap = Record<string, number>;
type ToolResult = Record<string, unknown>;
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
  strokeLength: Ruler,
  spm: Activity,
  vfdFrequency: SlidersHorizontal,
};

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
    });
    twinRef.current = twin;

    const browserWindow = window as Window & {
      digitalTwin?: unknown;
      updateDigitalTwin?: (payload: unknown) => unknown;
    };

    browserWindow.digitalTwin = twin;
    browserWindow.updateDigitalTwin = (payload: unknown) => {
      const parsed = parseBackendPayload(
        payload as Record<string, unknown>,
        operationsRef.current.optimized,
      );
      setOperations((previous) => ({
        ...previous,
        optimized: parsed.parameters as Operation,
      }));
      setPredictions(parsed.predictions as PredictionMap);
      setMode('optimized');
      setApiStatus('Backend-style payload applied to AI Recommended Operation');
      return twin.updateFromBackendPayload(payload as Record<string, unknown>);
    };

    return () => {
      twin.dispose();
      twinRef.current = null;
      delete browserWindow.digitalTwin;
      delete browserWindow.updateDigitalTwin;
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
    twin.updateDigitalTwin(operations[mode], {
      predictions: mode === 'optimized' ? predictions : {},
    });
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
          'Return the selected digital twin mode, current operation, recommended operation, predictions, and derived visual summary.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute() {
          const selectedMode = modeRef.current;
          const selected = operationsRef.current[selectedMode];
          const visualState = deriveTwinState(
            selected,
            selectedMode === 'optimized' ? predictionsRef.current : {},
          );

          return {
            mode: selectedMode,
            currentOperation: operationsRef.current.current,
            aiRecommendedOperation: operationsRef.current.optimized,
            predictions: predictionsRef.current,
            summary: summarizeTwinState(visualState),
          };
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
              additionalProperties: { type: 'number' },
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
          const nextState = deriveTwinState(nextParameters, nextPredictions);

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
          });

          return {
            mode: 'optimized',
            parameters: nextParameters,
            predictions: nextPredictions,
            summary: summarizeTwinState(nextState),
          };
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
  const currentSummary = summarizeTwinState(deriveTwinState(operations.current));
  const optimizedSummary = summarizeTwinState(
    deriveTwinState(operations.optimized, predictions),
  );

  function handleParameterChange(key: ParameterKey, value: number) {
    setOperations((previous) => ({
      ...previous,
      [mode]: updateOperationValue(previous[mode], key, value) as Operation,
    }));
  }

  function handleApplyMockPayload() {
    const parsed = parseBackendPayload(testData.backendPayload, operations.current);
    setOperations((previous) => ({
      ...previous,
      optimized: parsed.parameters as Operation,
    }));
    setPredictions(parsed.predictions as PredictionMap);
    setMode('optimized');
    setApiStatus('Mock API payload applied');
  }

  function handleReset() {
    setOperations({
      current: initialCurrent,
      optimized: initialOptimized,
    });
    setPredictions(initialPredictions);
    setMode('current');
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
              AI Recommended
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="dt-actions">
          <Button type="button" variant="outline" onClick={handleReset}>
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
          <Button type="button" onClick={handleApplyMockPayload}>
            <CloudCog aria-hidden="true" />
            Apply API Mock
          </Button>
        </div>
      </header>

      <section className="dt-statusbar" aria-label="Selected operating state">
        <Badge className="dt-mode-badge">{MODE_LABELS[mode]}</Badge>
        <span>{apiStatus}</span>
        <span>Visual representation only, not a physics simulation</span>
      </section>

      <section className="dt-workspace">
        <section className="dt-viewport-panel" aria-label="3D digital twin viewport">
          <div ref={containerRef} className="dt-viewport" />

          <div className="dt-viewport-overlay">
            <div>
              <p>Thermal index</p>
              <strong>{selectedSummary.thermalIndex}%</strong>
            </div>
            <div>
              <p>Oil mobility index</p>
              <strong>{selectedSummary.mobilityIndex}%</strong>
            </div>
            <div>
              <p>Pump duty index</p>
              <strong>{selectedSummary.pumpDuty}%</strong>
            </div>
          </div>

          <div className="dt-risk-row" aria-label="Equipment risk indicators">
            <RiskPill
              label="ROD FLOATING RISK"
              level={selectedState.rodFloatingRisk}
              score={selectedState.rodFloatingScore}
            />
            <RiskPill
              label="IMPACT LOADING"
              level={selectedState.impactLoadingRisk}
              score={selectedState.impactLoadingScore}
            />
          </div>
        </section>

        <aside className="dt-side">
          <section className="dt-panel">
            <div className="dt-panel-heading">
              <div>
                <p>Operating parameters</p>
                <h2>{MODE_LABELS[mode]}</h2>
              </div>
              <Badge variant="outline">Mock units</Badge>
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
                <p>Current vs optimized</p>
                <h2>Before / after view</h2>
              </div>
              <Badge variant="secondary">Demo state</Badge>
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
                label="Viscosity index"
                before={`${currentSummary.viscosityIndex}%`}
                after={`${optimizedSummary.viscosityIndex}%`}
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
                  percent={key === 'rodFailureRisk'}
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
      <small>{Math.round(score * 100)}%</small>
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

function getSliderNumber(value: number | readonly number[]) {
  return Number(Array.isArray(value) ? value[0] : value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function PredictionRow({
  label,
  value,
  unit,
  percent = false,
}: {
  label: string;
  value?: number;
  unit: string;
  percent?: boolean;
}) {
  const hasValue = Number.isFinite(Number(value));
  const displayValue = hasValue
    ? percent
      ? `${Math.round(Number(value) * 100)}%`
      : `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 2)}${unit ? ` ${unit}` : ''}`
    : 'Pending';

  return (
    <div className="dt-prediction-row">
      <span>{label}</span>
      <strong>{displayValue}</strong>
    </div>
  );
}
