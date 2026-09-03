'use client';

import { type ReactNode, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CloudCog,
  Database,
  GitCompare,
  RotateCcw,
  Server,
  SlidersHorizontal,
  Waves,
} from 'lucide-react';

import DigitalTwin, { type DigitalTwinProps } from '@/components/DigitalTwin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MODE_LABELS, deriveTwinState, normalizeOperation } from '@/src/controls.js';
import testData from '@/test-data.json';

type Mode = 'current' | 'optimized';
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

const demoWell = {
  id: '9f437d80-61f1-4a33-9cf6-43d95bb13f0b',
  well_name: 'Baghewala CSS-SRP Well BW-07',
  reservoir_temperature: 55,
  reservoir_pressure: 35,
};
const currentOperation = normalizeOperation(testData.currentOperation) as Operation;
const optimizedOperation = normalizeOperation(testData.aiRecommendedOperation) as Operation;
const recommendedPredictions = testData.backendPayload.predictions;

export default function Home() {
  const [mode, setMode] = useState<Mode>('current');
  const [simulationEnabled, setSimulationEnabled] = useState(true);
  const [optimizationEnabled, setOptimizationEnabled] = useState(true);
  const [riskEnabled, setRiskEnabled] = useState(true);
  const twinProps = useMemo(
    () =>
      createDigitalTwinProps({
        mode,
        optimizationEnabled,
        riskEnabled,
        simulationEnabled,
      }),
    [mode, optimizationEnabled, riskEnabled, simulationEnabled],
  );
  const selectedOperation =
    mode === 'optimized' && optimizationEnabled ? optimizedOperation : currentOperation;
  const selectedPredictions =
    mode === 'optimized' && optimizationEnabled ? recommendedPredictions : {};
  const selectedState = deriveTwinState(
    selectedOperation,
    selectedPredictions,
  ) as Record<string, unknown>;

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
          <Button
            type="button"
            variant={simulationEnabled ? 'outline' : 'default'}
            onClick={() => setSimulationEnabled((value) => !value)}
          >
            <Server aria-hidden="true" />
            {simulationEnabled ? 'Simulation Feed On' : 'Run Simulation'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSimulationEnabled(true);
              setOptimizationEnabled(true);
              setRiskEnabled(true);
              setMode('current');
            }}
          >
            <RotateCcw aria-hidden="true" />
            Reset App State
          </Button>
        </div>
      </header>

      <section className="dt-statusbar" aria-label="Integration state">
        <Badge className="dt-mode-badge">{MODE_LABELS[mode]}</Badge>
        <span>Prop-driven React component boundary</span>
        <span>Well UUID: {demoWell.id}</span>
        <span>{simulationEnabled ? 'Simulation data active' : 'Simulation data idle'}</span>
      </section>

      <section className="dt-integration-grid">
        <div className="dt-left-stack">
          <section className="dt-panel">
            <PanelHeading
              eyebrow="Well conditions"
              title={demoWell.well_name}
              icon={<Database aria-hidden="true" />}
            />
            <div className="dt-output-grid">
              <OutputRow label="Reservoir temperature" value={`${demoWell.reservoir_temperature} C`} />
              <OutputRow label="Reservoir pressure" value={`${demoWell.reservoir_pressure} bar`} />
              <OutputRow label="Well ID" value={demoWell.id.slice(0, 8)} />
            </div>
          </section>

          <section className="dt-panel">
            <PanelHeading
              eyebrow="Optimization"
              title={optimizationEnabled ? 'Recommended run ready' : 'No recommendation'}
              icon={<CloudCog aria-hidden="true" />}
            />
            <div className="dt-compare-grid">
              <CompareRow
                label="Steam volume"
                before={`${currentOperation.steamVolume} t`}
                after={optimizationEnabled ? `${optimizedOperation.steamVolume} t` : 'Pending'}
              />
              <CompareRow
                label="Injection pressure"
                before={`${currentOperation.injectionPressure} bar`}
                after={optimizationEnabled ? `${optimizedOperation.injectionPressure} bar` : 'Pending'}
              />
              <CompareRow
                label="Soak time"
                before={`${currentOperation.soakTime} hr`}
                after={optimizationEnabled ? `${optimizedOperation.soakTime} hr` : 'Pending'}
              />
              <CompareRow
                label="Pump speed"
                before={`${currentOperation.spm} spm`}
                after={optimizationEnabled ? `${optimizedOperation.spm} spm` : 'Pending'}
              />
            </div>
            <div className="dt-panel-actions">
              <Button
                type="button"
                variant={optimizationEnabled ? 'outline' : 'default'}
                onClick={() => setOptimizationEnabled((value) => !value)}
              >
                <SlidersHorizontal aria-hidden="true" />
                {optimizationEnabled ? 'Hide Optimization' : 'Apply Optimization'}
              </Button>
            </div>
          </section>

          <section className="dt-panel">
            <PanelHeading
              eyebrow="Live simulation"
              title={simulationEnabled ? 'Flow model active' : 'Idle visual state'}
              icon={<Activity aria-hidden="true" />}
            />
            <div className="dt-output-grid">
              <OutputRow
                label="Flow speed"
                value={`${Math.round(stateNumber(selectedState, 'oilFlowSpeed') * 34)}%`}
              />
              <OutputRow
                label="Thermal color value"
                value={`${Math.round(stateNumber(selectedState, 'thermalIndex') * 100)}%`}
              />
              <OutputRow
                label="Pressure intensity"
                value={`${Math.round(stateNumber(selectedState, 'pressureRiskScore') * 100)}%`}
              />
              <OutputRow label="Rod behavior" value={readRodBehavior(selectedState)} />
            </div>
          </section>

          <section className="dt-panel">
            <PanelHeading
              eyebrow="Risk scoring"
              title={riskEnabled ? 'Backend scores attached' : 'Risk data idle'}
              icon={<AlertTriangle aria-hidden="true" />}
            />
            <div className="dt-risk-list">
              {[
                ['Rod floating', stateNumber(selectedState, 'rodFloatingScore')],
                ['Impact loading', stateNumber(selectedState, 'impactLoadingScore')],
                ['Pump unsetting', stateNumber(selectedState, 'pumpUnsettingScore')],
                ['Rod failure', stateNumber(selectedState, 'rodFailureScore')],
              ].map(([label, score]) => (
                <OutputRow
                  key={String(label)}
                  label={String(label)}
                  value={`${riskCategory(Number(score))} ${Math.round(Number(score) * 100)}%`}
                />
              ))}
            </div>
            <div className="dt-panel-actions">
              <Button
                type="button"
                variant={riskEnabled ? 'outline' : 'default'}
                onClick={() => setRiskEnabled((value) => !value)}
              >
                <AlertTriangle aria-hidden="true" />
                {riskEnabled ? 'Clear Risk Feed' : 'Attach Risk Feed'}
              </Button>
            </div>
          </section>
        </div>

        <DigitalTwin {...twinProps} />
      </section>
    </main>
  );
}

function createDigitalTwinProps({
  mode,
  optimizationEnabled,
  riskEnabled,
  simulationEnabled,
}: {
  mode: Mode;
  optimizationEnabled: boolean;
  riskEnabled: boolean;
  simulationEnabled: boolean;
}): DigitalTwinProps {
  const selectedOperation =
    mode === 'optimized' && optimizationEnabled ? optimizedOperation : currentOperation;
  const selectedPredictions =
    mode === 'optimized' && optimizationEnabled ? recommendedPredictions : {};
  const selectedState = deriveTwinState(
    selectedOperation,
    selectedPredictions,
  ) as Record<string, unknown>;
  const currentState = deriveTwinState(currentOperation) as Record<string, unknown>;
  const flowSpeed = Math.min(1, Math.max(0, stateNumber(selectedState, 'oilFlowSpeed') / 3));
  const warnings = buildWarnings(selectedState);

  return {
    well: demoWell,
    simulation: simulationEnabled
      ? {
          flow_speed: flowSpeed,
          flow_direction: flowSpeed < 0.05 ? 'stalled' : 'forward',
          temperature_color_value: stateNumber(selectedState, 'thermalIndex'),
          pressure_intensity: stateNumber(selectedState, 'pressureRiskScore'),
          pump_stroke_speed: selectedOperation.spm,
          rod_movement_behavior: readRodBehavior(selectedState),
          warnings,
        }
      : null,
    optimization: optimizationEnabled
      ? {
          recommendedParameters: {
            steam_volume: optimizedOperation.steamVolume,
            steam_injection_pressure: optimizedOperation.injectionPressure,
            soak_time: optimizedOperation.soakTime,
            production_cutoff: optimizedOperation.productionCutoff,
            stroke_length: optimizedOperation.strokeLength,
            rpm_or_spm: optimizedOperation.spm,
            vfd_frequency: optimizedOperation.vfdFrequency,
          },
          predictions: {
            current: {
              oil_production: Number(currentState.oilFlowRate ?? 0),
              sor: 4.8,
              energy_per_barrel: 2.72,
            },
            recommended: {
              oil_production: recommendedPredictions.oilProduction,
              sor: recommendedPredictions.sor,
              energy_per_barrel: recommendedPredictions.energyPerBarrel,
              rod_floating_risk: recommendedPredictions.rodFloatingRisk,
              impact_loading_risk: recommendedPredictions.impactLoadingRisk,
              pump_unsetting_risk: recommendedPredictions.pumpUnsettingRisk,
              rod_failure_risk: recommendedPredictions.rodFailureRisk,
            },
          },
        }
      : null,
    risk: riskEnabled
      ? {
          rod_floating: riskPayload(stateNumber(selectedState, 'rodFloatingScore')),
          impact_loading: riskPayload(stateNumber(selectedState, 'impactLoadingScore')),
          pump_unsetting: riskPayload(stateNumber(selectedState, 'pumpUnsettingScore')),
          rod_failure: riskPayload(stateNumber(selectedState, 'rodFailureScore')),
        }
      : null,
    mode,
  };
}

function PanelHeading({
  eyebrow,
  icon,
  title,
}: {
  eyebrow: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="dt-panel-heading">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <span className="dt-panel-icon">{icon}</span>
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

function CompareRow({
  after,
  before,
  label,
}: {
  after: string;
  before: string;
  label: string;
}) {
  return (
    <div className="dt-compare-row">
      <span>{label}</span>
      <strong>{before}</strong>
      <strong>{after}</strong>
    </div>
  );
}

function riskPayload(score: number) {
  return {
    risk_score: Number(score.toFixed(3)),
    category: riskCategory(score),
  };
}

function riskCategory(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 0.68) return 'HIGH';
  if (score >= 0.38) return 'MEDIUM';
  return 'LOW';
}

function readRodBehavior(
  state: Record<string, unknown>,
): 'normal' | 'floating_risk' | 'impact_risk' {
  if (Number(state.rodFloatingScore) >= 0.68) return 'floating_risk';
  if (Number(state.impactLoadingScore) >= 0.68) return 'impact_risk';
  return 'normal';
}

function buildWarnings(state: Record<string, unknown>) {
  const warnings: string[] = [];
  if (Number(state.rodFloatingScore) >= 0.68) warnings.push('Rod floating risk');
  if (Number(state.impactLoadingScore) >= 0.68) warnings.push('Impact loading risk');
  if (Number(state.pumpUnsettingScore) >= 0.68) warnings.push('Pump unsetting risk');
  if (Number(state.rodFailureScore) >= 0.68) warnings.push('Rod failure risk');
  return warnings;
}

function stateNumber(state: Record<string, unknown>, key: string, fallback = 0) {
  const number = Number(state[key]);
  return Number.isFinite(number) ? number : fallback;
}
