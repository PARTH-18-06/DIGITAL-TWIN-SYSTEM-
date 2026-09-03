import { createAnimationController } from './animations.js';
import {
  DEFAULT_OPERATION,
  deriveTwinState,
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
    this.sceneApi = createTwinScene(container);
    this.modelApi = createWellModel();
    this.animationApi = createAnimationController(this.modelApi.objects);

    this.sceneApi.scene.add(this.modelApi.group);
    this.sceneApi.setFrameHandler((delta, elapsed) => {
      this.animationApi.tick(delta, elapsed);
    });
    this.sceneApi.start();
    this.setMode(this.mode);
    this.updateDigitalTwin(this.parameters, { predictions: this.predictions });
  }

  updateDigitalTwin(parameters = {}, options = {}) {
    this.parameters = normalizeOperation(
      {
        ...this.parameters,
        ...parameters,
      },
      this.parameters,
    );
    this.predictions = options.predictions ?? this.predictions ?? {};

    const visualState = deriveTwinState(this.parameters, this.predictions);
    this.animationApi.setVisualState(visualState);
    this.lastVisualState = visualState;

    return {
      parameters: this.parameters,
      predictions: this.predictions,
      visualState,
      summary: summarizeTwinState(visualState),
    };
  }

  updateFromBackendPayload(payload = {}) {
    const { parameters, predictions } = parseBackendPayload(payload, this.parameters);
    return this.updateDigitalTwin(parameters, { predictions });
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
