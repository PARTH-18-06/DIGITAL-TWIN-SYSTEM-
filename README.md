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
SuckerRod
SRPPump
Motor
VFD
SurfaceUnit
```

If a Blender model replaces the procedural version, export the GLB with the same high-level names where possible.

## Digital Twin API

The app creates `window.digitalTwin` and `window.updateDigitalTwin()` in the browser.

```javascript
window.updateDigitalTwin({
  recommendedParameters: {
    steamVolume: 950,
    injectionPressure: 20,
    soakTime: 22,
    strokeLength: 60,
    spm: 7,
    vfdFrequency: 37
  },
  predictions: {
    oilProduction: 40,
    sor: 4.1,
    energyPerBarrel: 2.25,
    rodFailureRisk: 0.03
  }
});
```

The `DigitalTwin` class also supports direct setters:

```javascript
digitalTwin.setReservoirTemperature(value);
digitalTwin.setReservoirPressure(value);
digitalTwin.setSteamVolume(value);
digitalTwin.setInjectionPressure(value);
digitalTwin.setSoakTime(value);
digitalTwin.setStrokeLength(value);
digitalTwin.setSPM(value);
digitalTwin.setVFDFrequency(value);
digitalTwin.updateDigitalTwin({
  reservoirTemperature,
  reservoirPressure,
  steamVolume,
  injectionPressure,
  soakTime,
  strokeLength,
  spm,
  vfdFrequency
});
```

## Current vs AI Recommended

The UI supports two editable modes:

- Current Operation
- AI Recommended Operation

The current implementation uses `test-data.json` only as development data. Final values, engineering limits, units, and any claimed improvement must come from the real dataset, API contract, and ML outputs.
