# Digital Twin Integration Contract

This file is the handoff contract for Person 2's FastAPI backend and Person 3's AI/ML optimizer.

## React Component Props

`components/DigitalTwin.tsx` is the prop-driven component. In the teammate frontend,
drop the same component in as `frontend/src/components/DigitalTwin.tsx` and mount it
where `DigitalTwinPlaceholder.tsx` currently sits.

```ts
interface DigitalTwinProps {
  well: {
    id: string;
    well_name: string;
    reservoir_temperature: number | null;
    reservoir_pressure: number | null;
  } | null;

  simulation: {
    flow_speed: number;
    flow_direction: 'forward' | 'reverse' | 'stalled';
    temperature_color_value: number;
    pressure_intensity: number;
    pump_stroke_speed: number;
    rod_movement_behavior: 'normal' | 'floating_risk' | 'impact_risk';
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
    rod_floating: { risk_score: number; category: 'LOW' | 'MEDIUM' | 'HIGH' };
    impact_loading: { risk_score: number; category: 'LOW' | 'MEDIUM' | 'HIGH' };
    pump_unsetting: { risk_score: number; category: 'LOW' | 'MEDIUM' | 'HIGH' };
    rod_failure: { risk_score: number; category: 'LOW' | 'MEDIUM' | 'HIGH' };
  } | null;

  mode: 'current' | 'optimized';
}
```

The component does not fetch. `null` means the visual falls back to a calm idle state.
The parent owns the Current vs AI Optimized toggle through `mode`. Timeline
Start/Pause/Reset/Speed controls are inside the component.

## Required Input Parameter Names

Use exactly these names:

```json
{
  "reservoirTemperature": 68,
  "reservoirPressure": 36,
  "steamVolume": 950,
  "injectionPressure": 20,
  "soakTime": 22,
  "productionCutoff": 10,
  "strokeLength": 60,
  "spm": 7,
  "vfdFrequency": 37
}
```

Do not rename these fields to short forms such as `temp`, `reservoirTemp`, or `pumpSpeed`.

## Backend / AI Payload

```json
{
  "recommendedParameters": {
    "reservoirTemperature": 68,
    "reservoirPressure": 36,
    "steamVolume": 950,
    "injectionPressure": 20,
    "soakTime": 22,
    "productionCutoff": 10,
    "strokeLength": 60,
    "spm": 7,
    "vfdFrequency": 37
  },
  "predictions": {
    "oilProduction": 40,
    "sor": 4.1,
    "energyPerBarrel": 2.25,
    "rodFloatingRisk": 0.12,
    "impactLoadingRisk": 0.28,
    "pumpUnsettingRisk": 0.18,
    "rodFailureRisk": 0.03
  },
  "backendData": {
    "wellId": "demo-well"
  }
}
```

Risk values may be numbers from `0` to `1`, percentages from `0` to `100`, or strings: `LOW`, `MEDIUM`, `HIGH`.

## Browser Integration

```javascript
window.updateDigitalTwin({
  reservoirTemperature,
  reservoirPressure,
  steamVolume,
  injectionPressure,
  soakTime,
  productionCutoff,
  strokeLength,
  spm,
  vfdFrequency
});

window.updateDigitalTwin({
  recommendedParameters,
  predictions,
  backendData
});

const state = window.getDigitalTwinState();
```

## Returned State Shape

```json
{
  "systemState": "CURRENT",
  "selectedMode": "current",
  "phase": "Heating",
  "cycleProgress": 42.5,
  "inputParameters": {},
  "digitalTwinCalculated": {
    "reservoirTemperature": 68.5,
    "oilLevel": 72.4,
    "oilFlowRate": 12.7,
    "steamFlowRate": 850,
    "oilMobilityIndex": 64.2,
    "thermalIndex": 71.8,
    "pumpStrokeSpeed": 7.9,
    "rodMovement": "normal",
    "pressureState": "LOW"
  },
  "aiPredicted": {},
  "backendDatabase": {},
  "risks": {
    "rodFloatingRisk": "LOW",
    "impactLoadingRisk": "MEDIUM",
    "pumpUnsettingRisk": "LOW",
    "rodFailureRisk": "LOW"
  },
  "riskScores": {
    "rodFloatingRisk": 12,
    "impactLoadingRisk": 28,
    "pumpUnsettingRisk": 18,
    "rodFailureRisk": 3
  }
}
```

The returned state separates:

- `inputParameters`: values received from the dashboard/backend.
- `digitalTwinCalculated`: values calculated by the visualization layer.
- `aiPredicted`: values received from Person 3's AI/ML system.
- `backendDatabase`: extra backend/database metadata received from Person 2.

## Simulation Controls

```javascript
window.startDigitalTwinSimulation();
window.pauseDigitalTwinSimulation();
window.resetDigitalTwinSimulation();
window.setDigitalTwinSimulationSpeed(2);
```

The built-in timeline is for demonstration. It makes the visual state move through Steam Injection, Heating, Soaking, Production, and Cooling so judges can see cause and effect.
