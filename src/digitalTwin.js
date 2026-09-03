import { createAnimationController } from './animations.js';
import {
  DEFAULT_OPERATION,
  createDigitalTwinOutput,
  deriveTwinState,
  getCssTimelineSnapshot,
  normalizeOperation,
  parseBackendPayload,
  summarizeTwinState,
} from './controls.js';
import { createWellModel } from './model.js';
import { createTwinScene } from './scene.js';

export class DigitalTwin {
  constructor(container, options = {}) {
    this.mode = options.mode ?? 'current';
    this.parameters = normalizeOperation(options.initialOperation ?? DEFAULT_OPERATION);
    this.predictions = options.predictions ?? {};
    this.backendData = options.backendData ?? {};
    this.liveSimulation = options.liveSimulation ?? null;
    this.onStateChange = options.onStateChange ?? null;
    this.simulation = {
      enabled: false,
      running: false,
      timeSeconds: 0,
      speed: 1,
    };
    this.lastEmitTime = 0;
    this.sceneApi = createTwinScene(container);
    this.modelApi = createWellModel();
    this.animationApi = createAnimationController(this.modelApi.objects);

    this.sceneApi.scene.add(this.modelApi.group);
    this.sceneApi.setFrameHandler((delta, elapsed) => {
      this.advanceSimulation(delta, elapsed);
      this.animationApi.tick(delta, elapsed);
    });
    this.sceneApi.start();
    this.setMode(this.mode);
    this.updateDigitalTwin(this.parameters, {
      predictions: this.predictions,
      backendData: this.backendData,
      liveSimulation: this.liveSimulation,
    });
  }

  updateDigitalTwin(parameters = {}, options = {}) {
    this.parameters = normalizeOperation(
      {
        ...this.parameters,
        ...parameters,
      },
      this.parameters,
    );
    if (options.predictions !== undefined) {
      this.predictions = options.predictions ?? {};
    }
    if (options.backendData !== undefined) {
      this.backendData = options.backendData ?? {};
    }
    if (options.liveSimulation !== undefined) {
      this.liveSimulation = options.liveSimulation ?? null;
    }
    if (options.simulation !== undefined) {
      this.simulation = {
        ...this.simulation,
        ...options.simulation,
        enabled: true,
      };
    }

    return this.renderCurrentState(true);
  }

  renderCurrentState(forceEmit = false, elapsed = 0) {
    const simulationSnapshot = this.simulation.enabled
      ? getCssTimelineSnapshot(this.parameters, this.simulation.timeSeconds)
      : null;
    const visualState = deriveTwinState(
      this.parameters,
      this.predictions,
      simulationSnapshot,
      this.liveSimulation,
    );
    this.animationApi.setVisualState(visualState);
    this.lastVisualState = visualState;
    this.output = createDigitalTwinOutput({
      mode: this.mode,
      parameters: this.parameters,
      visualState,
      predictions: this.predictions,
      backendData: this.backendData,
    });
    this.emitState(forceEmit, elapsed);

    return {
      parameters: this.parameters,
      predictions: this.predictions,
      visualState,
      summary: summarizeTwinState(visualState),
      output: this.output,
    };
  }

  updateFromBackendPayload(payload = {}) {
    const { parameters, predictions } = parseBackendPayload(payload, this.parameters);
    return this.updateDigitalTwin(parameters, {
      predictions,
      backendData: payload.backendData ?? payload.database ?? {},
    });
  }

  getDigitalTwinState() {
    if (!this.output) {
      this.renderCurrentState(true);
    }

    return this.output;
  }

  setComparison({ current, recommended }) {
    this.animationApi.setComparisonState({
      current: deriveTwinState(current),
      optimized: deriveTwinState(recommended, this.predictions),
    });
  }

  setMode(mode) {
    this.mode = mode === 'optimized' ? 'optimized' : 'current';
    this.animationApi.setMode(this.mode);
    return this.renderCurrentState(true);
  }

  startSimulation() {
    this.simulation.enabled = true;
    this.simulation.running = true;
    return this.renderCurrentState(true);
  }

  pauseSimulation() {
    this.simulation.running = false;
    return this.renderCurrentState(true);
  }

  resetSimulation(options = {}) {
    this.simulation.timeSeconds = 0;
    this.simulation.running = false;
    this.simulation.enabled = options.disable === true ? false : true;
    return this.renderCurrentState(true);
  }

  setSimulationSpeed(speed) {
    const nextSpeed = Number(speed);
    this.simulation.speed = Number.isFinite(nextSpeed)
      ? Math.min(6, Math.max(0.25, nextSpeed))
      : 1;
    return this.renderCurrentState(true);
  }

  advanceSimulation(delta, elapsed) {
    if (!this.simulation.running) return;
    this.simulation.timeSeconds += delta * this.simulation.speed;
    this.renderCurrentState(false, elapsed);
  }

  emitState(force = false, elapsed = 0) {
    if (!this.onStateChange) return;
    if (!force && elapsed - this.lastEmitTime < 0.2) return;
    this.lastEmitTime = elapsed;
    this.onStateChange(this.getDigitalTwinState());
  }

  setReservoirTemperature(value) {
    return this.updateDigitalTwin({ reservoirTemperature: value });
  }

  setReservoirPressure(value) {
    return this.updateDigitalTwin({ reservoirPressure: value });
  }

  setSteamVolume(value) {
    return this.updateDigitalTwin({ steamVolume: value });
  }

  setInjectionPressure(value) {
    return this.updateDigitalTwin({ injectionPressure: value });
  }

  setSoakTime(value) {
    return this.updateDigitalTwin({ soakTime: value });
  }

  setProductionCutoff(value) {
    return this.updateDigitalTwin({ productionCutoff: value });
  }

  setStrokeLength(value) {
    return this.updateDigitalTwin({ strokeLength: value });
  }

  setSPM(value) {
    return this.updateDigitalTwin({ spm: value });
  }

  setVFDFrequency(value) {
    return this.updateDigitalTwin({ vfdFrequency: value });
  }

  resize() {
    this.sceneApi.resize();
  }

  dispose() {
    this.sceneApi.dispose();
  }
}

export function createDigitalTwin(container, options = {}) {
  return new DigitalTwin(container, options);
}
