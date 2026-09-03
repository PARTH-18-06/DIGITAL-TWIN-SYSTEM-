# Baghewala CSS + SRP Digital Twin

Interactive Three.js well-to-surface digital twin for demonstrating Cyclic Steam Stimulation (CSS) and Sucker Rod Pump (SRP) operations in a heavy-oil well.

This is a visualization and API-integration surface for the SIH demo. It does not claim to be a CFD, reservoir, or mechanical physics simulator.

## Run

```bash
npm install
npm run dev
```

## Main Files

```text
digital-twin/
|-- models/
|   `-- well.glb
|-- public/
|   `-- models/well.glb
|-- src/
|   |-- scene.js
|   |-- model.js
|   |-- animations.js
|   |-- controls.js
|   `-- digitalTwin.js
|-- API-CONTRACT.md
|-- app/
|   |-- page.tsx
|   `-- globals.css
|-- README.md
`-- test-data.json
```

## Object Names

The live Three.js model exposes these stable object names:

```text
Well
Reservoir
SteamInjector
SteamFlow
ProductionTubing
OilFlow
WellboreLiquid
SuckerRod
SRPPump
Motor
VFD
SurfaceUnit
SurfaceProductionLine
```

If a Blender model replaces the procedural version, export the GLB with the same high-level names where possible.

## Digital Twin API

The app creates `window.digitalTwin` and `window.updateDigitalTwin()` in the browser.

```javascript
window.updateDigitalTwin({
  reservoirTemperature: 68,
  reservoirPressure: 36,
  steamVolume: 950,
  injectionPressure: 20,
  soakTime: 22,
  productionCutoff: 10,
  strokeLength: 60,
  spm: 7,
  vfdFrequency: 37
});
```

It also accepts Person 2 / Person 3 backend-style payloads:

```javascript
window.updateDigitalTwin({
  recommendedParameters: {
    reservoirTemperature: 62,
    reservoirPressure: 36,
    steamVolume: 950,
    injectionPressure: 20,
    soakTime: 22,
    productionCutoff: 10,
    strokeLength: 60,
    spm: 7,
    vfdFrequency: 37
  },
  predictions: {
    oilProduction: 40,
    sor: 4.1,
    energyPerBarrel: 2.25,
    rodFloatingRisk: 0.12,
    impactLoadingRisk: 0.28,
    pumpUnsettingRisk: 0.18,
    rodFailureRisk: 0.03
  }
});
```

Read back the current state with:

```javascript
window.getDigitalTwinState();
```

The `DigitalTwin` class also supports direct setters:

```javascript
digitalTwin.setReservoirTemperature(value);
digitalTwin.setReservoirPressure(value);
digitalTwin.setSteamVolume(value);
digitalTwin.setInjectionPressure(value);
digitalTwin.setSoakTime(value);
digitalTwin.setProductionCutoff(value);
digitalTwin.setStrokeLength(value);
digitalTwin.setSPM(value);
digitalTwin.setVFDFrequency(value);
digitalTwin.updateDigitalTwin({
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
digitalTwin.getDigitalTwinState();
digitalTwin.startSimulation();
digitalTwin.pauseSimulation();
digitalTwin.resetSimulation();
digitalTwin.setSimulationSpeed(2);
```

## Current vs AI Recommended

The UI supports two editable modes:

- Current Operation
- AI Recommended Operation

The current implementation uses `test-data.json` only as development data. Final values, engineering limits, units, and any claimed improvement must come from the real dataset, API contract, and ML outputs.

## Time-Based CSS Simulation

The Digital Twin includes a demo timeline with:

- Steam Injection
- Heating
- Soaking
- Production
- Cooling

The timeline changes the visual state gradually. During heating, the heated region, steam activity, oil mobility, liquid level, and flow rise. During cooling, they decay toward the initial state. This is a physics-inspired visualization for judges, not a calibrated reservoir simulator.
