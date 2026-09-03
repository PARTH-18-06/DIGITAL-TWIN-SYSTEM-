import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

type FlowDirection = 'forward' | 'reverse' | 'stalled'
type RodMovementBehavior = 'normal' | 'floating_risk' | 'impact_risk'
type RiskCategory = 'LOW' | 'MEDIUM' | 'HIGH'

export type TwinMode = 'current' | 'optimized'

export interface DigitalTwinProps {
  well: {
    id: string
    well_name: string
    reservoir_temperature: number | null
    reservoir_pressure: number | null
  } | null

  simulation: {
    flow_speed: number
    flow_direction: FlowDirection
    temperature_color_value: number
    pressure_intensity: number
    pump_stroke_speed: number
    rod_movement_behavior: RodMovementBehavior
    warnings: string[]
  } | null

  currentInput: {
    steam_volume: number
  } | null

  optimization: {
    recommendedParameters: {
      steam_volume: number
      steam_injection_pressure: number
      soak_time: number
      production_cutoff: number
      stroke_length: number
      rpm_or_spm: number
      vfd_frequency: number
    }
    predictions: {
      current: Record<string, number>
      recommended: Record<string, number>
    }
  } | null

  risk: {
    rod_floating: { risk_score: number; category: RiskCategory }
    impact_loading: { risk_score: number; category: RiskCategory }
    pump_unsetting: { risk_score: number; category: RiskCategory }
    rod_failure: { risk_score: number; category: RiskCategory }
  } | null

  mode: TwinMode
}

type TwinVisualState = {
  mode: TwinMode
  wellName: string
  signedFlowSpeed: number
  flowMagnitude: number
  flowDirection: FlowDirection
  flowAnimationValue: number
  temperatureValue: number
  pressureIntensity: number
  pumpStrokeSpeed: number
  rodStrokeAmplitude: number
  rodMovementBehavior: RodMovementBehavior
  steamIntensity: number
  warnings: string[]
  riskLevel: number
  riskCategory: RiskCategory
  production: number | null
  energyPerBarrel: number | null
  steamOilRatio: number | null
  steamVolume: number | null
  injectionPressure: number | null
}

type VisualStates = {
  currentVisualState: TwinVisualState
  optimizedVisualState: TwinVisualState
  activeVisualState: TwinVisualState
}

type ModelHandles = {
  root: THREE.Object3D | null
  reservoir: THREE.Object3D | null
  pressureShell: THREE.Object3D | null
  rod: THREE.Object3D | null
  walkingBeam: THREE.Object3D | null
  horseHead: THREE.Object3D | null
  surfacePumpPivot: THREE.Object3D | null
  surfaceUnitFallback: THREE.Object3D | null
  downholePump: THREE.Object3D | null
  steamFlow: THREE.Object3D | null
  oilFlow: THREE.Object3D | null
  riskHalo: THREE.Object3D | null
}

type TwinScene = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  composer: EffectComposer
  bloomComposer: EffectComposer
  controls: OrbitControls
  handles: ModelHandles
  fallbackRoot: THREE.Object3D | null
  environmentMap: THREE.Texture | null
  resize: () => void
  resizeObserver: ResizeObserver | null
  animationFrame: number | null
  disposed: boolean
}

const MODEL_URL = '/models/well.glb'
const BLOOM_LAYER = 1
const SELECTIVE_BLOOM_LAYER = new THREE.Layers()
SELECTIVE_BLOOM_LAYER.set(BLOOM_LAYER)
const DARK_BLOOM_MATERIAL = new THREE.MeshBasicMaterial({ color: '#000000' })

const DEFAULT_STATE: TwinVisualState = {
  mode: 'current',
  wellName: 'No well selected',
  signedFlowSpeed: 0,
  flowMagnitude: 0,
  flowDirection: 'stalled',
  flowAnimationValue: 0,
  temperatureValue: 0.35,
  pressureIntensity: 0.35,
  pumpStrokeSpeed: 0.4,
  rodStrokeAmplitude: 0.22,
  rodMovementBehavior: 'normal',
  steamIntensity: 0.35,
  warnings: ['Select a real BGH well and run simulation to animate live operating state.'],
  riskLevel: 0,
  riskCategory: 'LOW',
  production: null,
  energyPerBarrel: null,
  steamOilRatio: null,
  steamVolume: null,
  injectionPressure: null,
}

export function DigitalTwin(props: DigitalTwinProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<TwinScene | null>(null)
  const visualRef = useRef<TwinVisualState>(DEFAULT_STATE)
  const [isRunning, setIsRunning] = useState(true)
  const runningRef = useRef(true)
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(1)
  const [modelStatus, setModelStatus] = useState<'loading' | 'loaded' | 'fallback'>('loading')
  const [webglError, setWebglError] = useState('')
  const [renderStats, setRenderStats] = useState({ fps: 0, glbLoadMs: 0, canvasCount: 0, loopTicks: 0 })

  const visualStates = useMemo(() => deriveVisualStates(props), [props])
  const { activeVisualState, currentVisualState, optimizedVisualState } = visualStates

  useEffect(() => {
    visualRef.current = activeVisualState
    applyVisualState(sceneRef.current, activeVisualState)
  }, [activeVisualState])

  useEffect(() => {
    runningRef.current = isRunning
  }, [isRunning])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let twin: TwinScene
    try {
      twin = createTwinScene(container)
    } catch (error) {
      setWebglError(error instanceof Error ? error.message : 'WebGL initialization failed.')
      setModelStatus('fallback')
      return
    }

    sceneRef.current = twin
    setRenderStats(stats => ({ ...stats, canvasCount: container.querySelectorAll('canvas').length }))
    applyVisualState(twin, visualRef.current)

    const modelUrl = new URLSearchParams(window.location.search).get('model') === 'missing' ? '/models/missing-well.glb' : MODEL_URL
    const startedAt = performance.now()
    new GLTFLoader().load(
      modelUrl,
      gltf => {
        const root = gltf.scene
        if (twin.disposed) {
          disposeObject(root)
          return
        }
        root.name = 'AbhishekWellGLB'
        fitObjectToScene(root, 5.6)
        root.position.set(0, 0, 0)
        prepareObjectForAnimation(root)
        twin.scene.add(root)
        frameCameraToObject(twin, root)

        if (twin.fallbackRoot) {
          twin.scene.remove(twin.fallbackRoot)
          disposeObject(twin.fallbackRoot)
          twin.fallbackRoot = null
        }

        twin.handles = createGlbHandles(root)
        ensureMissingOverlays(twin)
        applyVisualState(twin, visualRef.current)
        setModelStatus('loaded')
        setRenderStats(stats => ({ ...stats, glbLoadMs: Math.round(performance.now() - startedAt) }))
      },
      undefined,
      () => {
        if (twin.disposed) return
        setModelStatus('fallback')
      },
    )

    let frameCount = 0
    let loopTicks = 0
    let lastStatsAt = performance.now()
    let previousFrameAt = performance.now()
    const animationStartedAt = previousFrameAt

    const render = () => {
      if (twin.disposed) return
      const frameAt = performance.now()
      const delta = Math.min((frameAt - previousFrameAt) / 1000, 0.05)
      previousFrameAt = frameAt
      loopTicks += 1

      if (runningRef.current) {
        animateTwin(twin, visualRef.current, delta, (frameAt - animationStartedAt) / 1000, speedRef.current)
      }
      twin.controls.update()
      renderTwinScene(twin)
      frameCount += 1

      const now = performance.now()
      if (now - lastStatsAt > 1500) {
        setRenderStats(stats => ({
          ...stats,
          fps: Math.round((frameCount * 1000) / (now - lastStatsAt)),
          canvasCount: container.querySelectorAll('canvas').length,
          loopTicks,
        }))
        frameCount = 0
        lastStatsAt = now
      }

      twin.animationFrame = window.requestAnimationFrame(render)
    }

    twin.animationFrame = window.requestAnimationFrame(render)

    return () => {
      disposeTwinScene(twin)
      if (sceneRef.current === twin) sceneRef.current = null
    }
  }, [])

  const statusText = webglError
    ? 'WebGL unavailable - showing dashboard fallback'
    : modelStatus === 'loaded'
      ? `well.glb loaded as primary model${renderStats.glbLoadMs ? ` in ${renderStats.glbLoadMs} ms` : ''}`
      : modelStatus === 'fallback'
        ? '3D model fallback active'
        : 'Loading well.glb; fallback standby'

  return (
    <section className="dt-embed" aria-label="Three.js digital twin visualization">
      <div className="dt-embed-head">
        <div>
          <span className="eyebrow">Three.js digital twin</span>
          <h2>{activeVisualState.wellName}</h2>
        </div>
        <span className={`dt-embed-mode ${activeVisualState.mode}`}>{activeVisualState.mode === 'optimized' ? 'AI recommended' : 'Current'}</span>
      </div>

      <div className="dt-embed-canvas-wrap">
        {webglError ? (
          <div className="dt-webgl-fallback">
            <strong>3D view unavailable</strong>
            <span>{webglError}</span>
          </div>
        ) : (
          <div ref={containerRef} className="dt-embed-canvas" />
        )}

        <div className="dt-embed-overlay">
          <span className={`dt-flow-badge ${activeVisualState.flowDirection}`}>{activeVisualState.flowDirection} flow</span>
          <span>Signed speed {formatMetric(activeVisualState.signedFlowSpeed)}</span>
          <span>Magnitude {formatMetric(activeVisualState.flowMagnitude)}</span>
          <span>Temp {Math.round(activeVisualState.temperatureValue * 100)}%</span>
          <span>Pressure {Math.round(activeVisualState.pressureIntensity * 100)}%</span>
        </div>
      </div>

      <div className="dt-embed-controls">
        <div className="dt-embed-action-row">
          <button type="button" onClick={() => setIsRunning(value => !value)}>{isRunning ? 'Pause' : 'Start'}</button>
          <button type="button" onClick={() => { setSpeed(1); applyVisualState(sceneRef.current, activeVisualState) }}>Reset</button>
          <label className="dt-speed">
            Speed
            <input min="0.25" max="2.5" step="0.25" type="range" value={speed} onChange={event => setSpeed(Number(event.target.value))} />
            <span>{speed.toFixed(2)}x</span>
          </label>
        </div>
        <small className="dt-running-state">{statusText} | {renderStats.fps || '--'} fps | canvases: {renderStats.canvasCount || '--'} | loop ticks: {renderStats.loopTicks}</small>
        {activeVisualState.mode === 'optimized' && <small className="dt-mode-note">Recommended mode visualizes model-predicted operating conditions; prototype using synthetic data.</small>}
      </div>

      <div className="dt-embed-metrics">
        <Metric label="Production" value={activeVisualState.production} suffix=" bbl/d" />
        <Metric label="Energy" value={activeVisualState.energyPerBarrel} suffix=" /bbl" />
        <Metric label="SOR" value={activeVisualState.steamOilRatio} />
        <Metric label="Steam" value={activeVisualState.steamVolume} suffix=" m³" />
      </div>

      <div className="dt-risk-strip">
        <span className={`dt-risk-pill ${activeVisualState.riskCategory.toLowerCase()}`}>
          Max risk {activeVisualState.riskCategory} {Math.round(activeVisualState.riskLevel * 100)}%
        </span>
        <span>Rod behavior: {activeVisualState.rodMovementBehavior.replace('_', ' ')}</span>
        <span>Pump {formatMetric(activeVisualState.pumpStrokeSpeed)} spm</span>
        <span>Rod amplitude {formatMetric(activeVisualState.rodStrokeAmplitude)}</span>
        {activeVisualState.injectionPressure !== null && <span>Injection {formatMetric(activeVisualState.injectionPressure)}</span>}
      </div>

      <div className="dt-state-debug" aria-label="Digital twin visual-state comparison">
        <span>Current flow {formatMetric(currentVisualState.signedFlowSpeed)} / pump {formatMetric(currentVisualState.pumpStrokeSpeed)}</span>
        <span>Recommended flow {formatMetric(optimizedVisualState.signedFlowSpeed)} / pump {formatMetric(optimizedVisualState.pumpStrokeSpeed)}</span>
      </div>

      {activeVisualState.warnings.length > 0 && (
        <div className="dt-embed-warnings">
          {activeVisualState.warnings.map(warning => <span key={warning}>{warning}</span>)}
        </div>
      )}
    </section>
  )
}

function Metric({ label, suffix = '', value }: { label: string; suffix?: string; value: number | null }) {
  return <div className="dt-embed-metric"><span>{label}</span><strong>{value === null ? '-' : `${formatMetric(value)}${suffix}`}</strong></div>
}

function deriveVisualStates(props: DigitalTwinProps): VisualStates {
  const currentVisualState = deriveCurrentVisualState(props)
  const optimizedVisualState = deriveOptimizedVisualState(props, currentVisualState)
  return {
    currentVisualState,
    optimizedVisualState,
    activeVisualState: props.mode === 'optimized' ? optimizedVisualState : currentVisualState,
  }
}

function deriveCurrentVisualState({ currentInput, optimization, risk, simulation, well }: DigitalTwinProps): TwinVisualState {
  const signedFlowSpeed = simulation?.flow_speed ?? DEFAULT_STATE.signedFlowSpeed
  const flowMagnitude = Math.abs(signedFlowSpeed)
  const riskSummary = summarizeLiveRisk(risk)
  const temperatureValue = simulation?.temperature_color_value ?? normalizeRange(well?.reservoir_temperature, 40, 155, DEFAULT_STATE.temperatureValue)
  const pressureIntensity = simulation?.pressure_intensity ?? normalizeRange(well?.reservoir_pressure, 2, 6, DEFAULT_STATE.pressureIntensity)
  const currentPredictions = optimization?.predictions.current
  const production = readNumber(currentPredictions, 'oil_production', 'predicted_oil_flow_rate', 'oil_flow_rate')
  const energyPerBarrel = readNumber(currentPredictions, 'energy_per_barrel')
  const steamOilRatio = readNumber(currentPredictions, 'steam_oil_ratio', 'sor')

  return {
    ...DEFAULT_STATE,
    mode: 'current',
    wellName: well?.well_name ?? DEFAULT_STATE.wellName,
    signedFlowSpeed,
    flowMagnitude,
    flowDirection: simulation?.flow_direction ?? DEFAULT_STATE.flowDirection,
    flowAnimationValue: normalizeStageOneFlow(flowMagnitude),
    temperatureValue: clamp01(temperatureValue),
    pressureIntensity: clamp01(pressureIntensity),
    pumpStrokeSpeed: simulation?.pump_stroke_speed ?? DEFAULT_STATE.pumpStrokeSpeed,
    rodStrokeAmplitude: simulation ? rodAmplitudeFromBehavior(simulation.rod_movement_behavior, null) : DEFAULT_STATE.rodStrokeAmplitude,
    rodMovementBehavior: simulation?.rod_movement_behavior ?? (riskSummary.category === 'HIGH' ? 'impact_risk' : DEFAULT_STATE.rodMovementBehavior),
    warnings: simulation ? simulation.warnings : DEFAULT_STATE.warnings,
    riskLevel: riskSummary.score,
    riskCategory: riskSummary.category,
    production,
    energyPerBarrel,
    steamOilRatio,
    steamVolume: currentInput?.steam_volume ?? null,
  }
}

function deriveOptimizedVisualState({ optimization, well }: DigitalTwinProps, current: TwinVisualState): TwinVisualState {
  const recommended = optimization?.recommendedParameters
  const predictions = optimization?.predictions.recommended
  const production = readNumber(predictions, 'oil_production', 'predicted_oil_flow_rate', 'oil_flow_rate') ?? current.production
  const signedFlowSpeed = production !== null ? productionToDemoFlowSpeed(production) : current.signedFlowSpeed
  const riskSummary = summarizePredictionRisk(predictions, current.riskLevel, current.riskCategory)
  const injectionPressure = recommended?.steam_injection_pressure ?? current.injectionPressure
  const steamVolume = recommended?.steam_volume ?? current.steamVolume
  const pumpStrokeSpeed = recommended?.rpm_or_spm ?? current.pumpStrokeSpeed
  const strokeLength = recommended?.stroke_length ?? null
  const pressureIntensity = injectionPressure !== null ? normalizeInjectionPressure(injectionPressure) : current.pressureIntensity
  const steamIntensity = steamVolume !== null ? normalizeSteamVolume(steamVolume) : current.steamIntensity
  const flowDirection: FlowDirection = signedFlowSpeed > 0.0001 ? 'forward' : signedFlowSpeed < -0.0001 ? 'reverse' : 'stalled'
  const warnings = [
    'Recommended mode visualizes model-predicted operating conditions; prototype using synthetic data.',
    ...riskWarnings(riskSummary.score, riskSummary.category),
  ]

  return {
    ...current,
    mode: 'optimized',
    wellName: well?.well_name ?? current.wellName,
    signedFlowSpeed,
    flowMagnitude: Math.abs(signedFlowSpeed),
    flowDirection,
    flowAnimationValue: normalizeStageOneFlow(Math.abs(signedFlowSpeed)),
    temperatureValue: current.temperatureValue,
    pressureIntensity,
    pumpStrokeSpeed,
    rodStrokeAmplitude: rodAmplitudeFromBehavior(current.rodMovementBehavior, strokeLength),
    steamIntensity,
    warnings,
    riskLevel: riskSummary.score,
    riskCategory: riskSummary.category,
    production,
    energyPerBarrel: readNumber(predictions, 'energy_per_barrel') ?? current.energyPerBarrel,
    steamOilRatio: readNumber(predictions, 'steam_oil_ratio', 'sor') ?? current.steamOilRatio,
    steamVolume,
    injectionPressure,
  }
}

function createTwinScene(container: HTMLDivElement): TwinScene {
  const scene = new THREE.Scene()
  scene.name = 'BaghewalaDigitalTwinScene'
  scene.background = new THREE.Color('#10191b')
  scene.fog = new THREE.FogExp2('#10191b', 0.05)

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
  camera.position.set(5.4, 3.25, 6.2)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.18
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  container.replaceChildren(renderer.domElement)

  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  const environmentMap = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = environmentMap
  pmremGenerator.dispose()

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 3.2
  controls.maxDistance = 10
  controls.target.set(0, -1.6, 0)

  const composers = createComposers(renderer, scene, camera)

  scene.add(new THREE.HemisphereLight('#d8f7ff', '#2f271f', 0.72))
  const key = new THREE.DirectionalLight('#fff1cd', 3.45)
  key.position.set(4.6, 7.4, 3.2)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 18
  key.shadow.camera.left = -5
  key.shadow.camera.right = 5
  key.shadow.camera.top = 5
  key.shadow.camera.bottom = -5
  scene.add(key)
  const fill = new THREE.DirectionalLight('#79d7e2', 0.28)
  fill.position.set(-4, 1.8, -3)
  scene.add(fill)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(5.8, 5.8),
    new THREE.MeshStandardMaterial({ color: '#162426', roughness: 0.9, metalness: 0.03, transparent: true, opacity: 0.74 }),
  )
  ground.name = 'PresentationGroundPlane'
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  scene.add(ground)

  const grid = new THREE.GridHelper(5.8, 10, '#78968d', '#26373b')
  grid.name = 'PresentationGroundGrid'
  grid.position.y = 0.003
  grid.material.transparent = true
  grid.material.opacity = 0.34
  scene.add(grid)

  const fallback = createProceduralFallbackModel()
  scene.add(fallback.root)

  let twin: TwinScene
  const resize = () => {
    if (twin.disposed) return
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    twin.composer.setSize(width, height)
    twin.bloomComposer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  twin = {
    scene,
    camera,
    renderer,
    composer: composers.composer,
    bloomComposer: composers.bloomComposer,
    controls,
    handles: fallback.handles,
    fallbackRoot: fallback.root,
    environmentMap,
    resize,
    resizeObserver: null,
    animationFrame: null,
    disposed: false,
  }

  twin.resizeObserver = new ResizeObserver(resize)
  twin.resizeObserver.observe(container)
  window.addEventListener('resize', resize)
  resize()

  return twin
}

function createComposers(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const bloomComposer = new EffectComposer(renderer)
  bloomComposer.renderToScreen = false
  bloomComposer.addPass(new RenderPass(scene, camera))
  bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 1.15, 0.62, 0.08))

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
        }
      `,
      defines: {},
    }),
    'baseTexture',
  ))

  return { bloomComposer, composer }
}

function renderTwinScene(twin: TwinScene) {
  const darkenedMaterials = new Map<string, THREE.Material | THREE.Material[]>()
  twin.scene.traverse(object => darkenNonBloomed(object, darkenedMaterials))
  twin.bloomComposer.render()
  twin.scene.traverse(object => restoreMaterial(object, darkenedMaterials))
  twin.composer.render()
}

function darkenNonBloomed(object: THREE.Object3D, materials: Map<string, THREE.Material | THREE.Material[]>) {
  if (!isMesh(object) || object.layers.test(SELECTIVE_BLOOM_LAYER)) return
  materials.set(object.uuid, object.material)
  object.material = DARK_BLOOM_MATERIAL
}

function restoreMaterial(object: THREE.Object3D, materials: Map<string, THREE.Material | THREE.Material[]>) {
  if (!isMesh(object)) return
  const material = materials.get(object.uuid)
  if (material) object.material = material
}

function createProceduralFallbackModel(): { root: THREE.Group; handles: ModelHandles } {
  const root = new THREE.Group()
  root.name = 'ProceduralLoadingFallback'

  const reservoir = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 3.15, 0.72, 64), new THREE.MeshStandardMaterial({ color: '#92542c', roughness: 0.65, metalness: 0.05, transparent: true, opacity: 0.74 }))
  reservoir.name = 'FallbackReservoir'
  reservoir.position.y = -3.1
  root.add(reservoir)

  const pressureShell = new THREE.Mesh(new THREE.SphereGeometry(2.05, 40, 22), new THREE.MeshStandardMaterial({ color: '#2aa7a7', emissive: '#134947', transparent: true, opacity: 0.24, wireframe: true }))
  pressureShell.name = 'FallbackPressureShell'
  pressureShell.scale.y = 0.35
  pressureShell.position.y = -2.85
  root.add(pressureShell)

  const well = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 6.3, 32), new THREE.MeshStandardMaterial({ color: '#c8d0ca', metalness: 0.7, roughness: 0.25 }))
  well.name = 'FallbackWell'
  well.position.y = -0.35
  root.add(well)

  const rod = new THREE.Group()
  rod.name = 'FallbackSuckerRod'
  rod.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 5.45, 18), new THREE.MeshStandardMaterial({ color: '#f1d47c', emissive: '#2c2007', metalness: 0.4, roughness: 0.35 })))
  root.add(rod)

  const pump = new THREE.Group()
  pump.name = 'FallbackSRPPump'
  const pumpBody = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.22, 0.18), new THREE.MeshStandardMaterial({ color: '#d66d3f', emissive: '#391508', metalness: 0.15, roughness: 0.5 }))
  pumpBody.position.set(0, 2.35, 0)
  pump.add(pumpBody)
  root.add(pump)

  const steamFlow = createParticleFlow('FallbackSteamFlow', '#d9f4ff', -1.25, 72)
  const oilFlow = createParticleFlow('FallbackOilFlow', '#111111', 1.25, 72)
  const riskHalo = createRiskHalo()
  root.add(steamFlow, oilFlow, riskHalo)
  prepareObjectForAnimation(root)

  return { root, handles: { root, reservoir, pressureShell, rod, walkingBeam: pump, horseHead: null, surfacePumpPivot: pump, surfaceUnitFallback: null, downholePump: null, steamFlow, oilFlow, riskHalo } }
}

function createGlbHandles(root: THREE.Object3D): ModelHandles {
  const reservoir = findObject(root, ['Reservoir'])
  // Keep moving surface-unit parts separate from the static SurfaceUnit base/posts.
  // SurfaceUnit is only a graceful fallback for alternate GLBs that lack named beam
  // or horsehead meshes. SRPPump remains downhole-only. This stays a visual
  // approximation, not a calibrated kinematic model. The runtime pivot makes the
  // beam/head move as one pumpjack assembly even if the GLB stores them as sibling
  // meshes without a shared origin.
  const authoredSurfacePumpPivot = findObject(root, ['SurfacePumpPivot', 'BeamPivot', 'WalkingBeamPivot'])
  const walkingBeam = findObject(root, ['WalkingBeam'])
  const horseHead = findObject(root, ['HorseHead'])
  const surfacePumpPivot = authoredSurfacePumpPivot ?? createSurfacePumpPivot(root, walkingBeam, horseHead)
  return {
    root,
    reservoir,
    pressureShell: findObject(root, ['HeatedReservoirRegion', 'Reservoir']) ?? reservoir,
    rod: findObject(root, ['SuckerRod']),
    walkingBeam,
    horseHead,
    surfacePumpPivot,
    surfaceUnitFallback: surfacePumpPivot || walkingBeam || horseHead ? null : findObject(root, ['SurfaceUnit']),
    downholePump: findObject(root, ['SRPPump']),
    steamFlow: findObject(root, ['SteamFlow']) ?? findObject(root, ['SteamParticle']),
    oilFlow: findObject(root, ['OilFlow']) ?? findObject(root, ['OilParticle', 'WellboreLiquid']),
    riskHalo: null,
  }
}

function ensureMissingOverlays(twin: TwinScene) {
  if (!twin.handles.steamFlow) {
    const steamFlow = createParticleFlow('SteamFlowOverlay', '#d9f4ff', -1.25, 72)
    twin.scene.add(steamFlow)
    twin.handles.steamFlow = steamFlow
  }
  if (!twin.handles.oilFlow) {
    const oilFlow = createParticleFlow('OilFlowOverlay', '#111111', 1.25, 72)
    twin.scene.add(oilFlow)
    twin.handles.oilFlow = oilFlow
  }
  if (!twin.handles.riskHalo) {
    const riskHalo = createRiskHalo()
    twin.scene.add(riskHalo)
    twin.handles.riskHalo = riskHalo
  }
  prepareObjectForAnimation(twin.scene)
}

function createParticleFlow(name: string, color: string, x: number, count: number) {
  const group = new THREE.Group()
  group.name = name
  for (let index = 0; index < count; index += 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 }))
    const y = -3 + (index / Math.max(1, count - 1)) * 5.7
    const angle = index * 1.618
    mesh.position.set(x + Math.cos(angle) * 0.08, y, Math.sin(angle) * 0.08)
    group.add(mesh)
  }
  return group
}

function createRiskHalo() {
  const riskHalo = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.04, 12, 64), new THREE.MeshBasicMaterial({ color: '#c7df78', transparent: true, opacity: 0.35 }))
  riskHalo.name = 'RiskHaloOverlay'
  riskHalo.position.set(0, -0.8, 0)
  riskHalo.rotation.x = Math.PI / 2
  return riskHalo
}

function animateTwin(twin: TwinScene, state: TwinVisualState, delta: number, elapsed: number, speed: number) {
  const direction = state.flowDirection === 'reverse' ? -1 : state.flowDirection === 'forward' ? 1 : 0
  const flowOffset = delta * speed * direction * state.flowAnimationValue * 3.2
  if (direction !== 0) {
    animateFlow(twin.handles.steamFlow, flowOffset, state.steamIntensity)
    animateFlow(twin.handles.oilFlow, flowOffset, state.steamIntensity)
  }

  const pumpRate = Math.max(0.05, state.pumpStrokeSpeed / 4)
  const pumpPhase = Math.sin(elapsed * pumpRate * speed)
  setObjectYOffset(twin.handles.rod, pumpPhase * state.rodStrokeAmplitude)
  animateSurfacePump(twin.handles, pumpPhase * 0.18)
  setObjectYOffset(twin.handles.downholePump, pumpPhase * state.rodStrokeAmplitude * 0.12)
  setObjectScale(twin.handles.pressureShell, 1 + state.pressureIntensity * 0.16)
  setObjectScale(twin.handles.reservoir, 1 + state.temperatureValue * 0.035)
  if (twin.handles.riskHalo) twin.handles.riskHalo.rotation.z += delta * speed * (0.25 + state.riskLevel)
}

function animateSurfacePump(handles: ModelHandles, rotationAmount: number) {
  if (handles.surfacePumpPivot) {
    rotateObjectZ(handles.surfacePumpPivot, rotationAmount)
    return
  }

  rotateObjectZ(handles.surfaceUnitFallback, rotationAmount)
}

function createSurfacePumpPivot(root: THREE.Object3D, walkingBeam: THREE.Object3D | null, horseHead: THREE.Object3D | null) {
  const movingParts = [walkingBeam, horseHead].filter((part): part is THREE.Object3D => Boolean(part))
  if (movingParts.length === 0) return null

  const parent = movingParts[0].parent
  if (!parent) return null

  root.updateWorldMatrix(true, true)
  const beamBox = new THREE.Box3().setFromObject(walkingBeam ?? movingParts[0])
  const pivotWorld = beamBox.getCenter(new THREE.Vector3())
  const pivot = new THREE.Group()
  pivot.name = 'SurfacePumpBeamPivot'
  pivot.position.copy(parent.worldToLocal(pivotWorld))
  parent.add(pivot)
  pivot.updateWorldMatrix(true, false)
  movingParts.forEach(part => pivot.attach(part))
  ensureBaseTransform(pivot)
  return pivot
}

function animateFlow(flow: THREE.Object3D | null, offset: number, intensity: number) {
  if (!flow) return
  flow.traverse(object => {
    if (!isMesh(object)) return
    ensureBaseTransform(object)
    moveFlowObject(object, offset)
    setMaterialOpacity(object, 0.2 + clamp01(intensity) * 0.7)
  })
}

function moveFlowObject(object: THREE.Object3D, offset: number) {
  const motion = getFlowMotion(object)
  const base = object.userData.basePosition as THREE.Vector3
  const center = base[motion.axis]
  const min = center - motion.span / 2
  const max = center + motion.span / 2
  let value = object.position[motion.axis] + offset * motion.direction
  while (value > max) value -= motion.span
  while (value < min) value += motion.span
  object.position[motion.axis] = value
}

function getFlowMotion(object: THREE.Object3D): { axis: 'x' | 'y'; direction: 1 | -1; span: number } {
  const pathName = getObjectPathName(object)
  if (pathName.includes('steamdown')) return { axis: 'y', direction: -1, span: 4.2 }
  if (pathName.includes('steamreservoir')) return { axis: 'x', direction: 1, span: 1.25 }
  if (pathName.includes('horizontal') || pathName.includes('surface')) return { axis: 'x', direction: 1, span: 2.45 }
  if (pathName.includes('oillift') || pathName.includes('wellboreliquid') || pathName.includes('productiontubing')) return { axis: 'y', direction: 1, span: 4.9 }
  return { axis: 'y', direction: 1, span: 5.9 }
}

function getObjectPathName(object: THREE.Object3D) {
  const names: string[] = []
  let cursor: THREE.Object3D | null = object
  while (cursor) {
    names.push(cursor.name.toLowerCase())
    cursor = cursor.parent
  }
  return names.join(' ')
}

function applyVisualState(twin: TwinScene | null, state: TwinVisualState) {
  if (!twin) return
  const tempColor = new THREE.Color('#3f78c8').lerp(new THREE.Color('#ff7a35'), state.temperatureValue)
  const pressureColor = new THREE.Color('#1e6f72').lerp(new THREE.Color('#c7df78'), state.pressureIntensity)
  const riskColor = state.riskCategory === 'HIGH' ? '#f05c3f' : state.riskCategory === 'MEDIUM' ? '#f4b740' : '#c7df78'

  tintObject(twin.handles.reservoir, tempColor, 0.14)
  tintObject(twin.handles.pressureShell, pressureColor, 0.45, 0.16 + state.pressureIntensity * 0.42)
  tintObject(twin.handles.riskHalo, new THREE.Color(riskColor), 0, 0.25 + state.riskLevel * 0.5)
  setObjectScale(twin.handles.pressureShell, 1 + state.pressureIntensity * 0.16)
  setObjectScale(twin.handles.reservoir, 1 + state.temperatureValue * 0.035)
}

function findObject(root: THREE.Object3D, names: string[]): THREE.Object3D | null {
  let match: THREE.Object3D | null = null
  root.traverse(object => {
    if (match) return
    const objectName = object.name.toLowerCase()
    if (names.some(name => objectName.includes(name.toLowerCase()))) match = object
  })
  return match
}

function prepareObjectForAnimation(root: THREE.Object3D) {
  root.traverse(object => {
    ensureBaseTransform(object)
    if (isMesh(object)) {
      const pathName = getObjectPathName(object)
      object.castShadow = true
      object.receiveShadow = true
      if (isGlowObject(pathName)) object.layers.enable(BLOOM_LAYER)
      normalizeMeshMaterial(object, pathName)
    }
  })
}

function ensureBaseTransform(object: THREE.Object3D) {
  object.userData.basePosition ??= object.position.clone()
  object.userData.baseRotation ??= object.rotation.clone()
  object.userData.baseScale ??= object.scale.clone()
}

function setObjectYOffset(object: THREE.Object3D | null, offset: number) {
  if (!object) return
  ensureBaseTransform(object)
  const base = object.userData.basePosition as THREE.Vector3
  object.position.y = base.y + offset
}

function rotateObjectZ(object: THREE.Object3D | null, amount: number) {
  if (!object) return
  ensureBaseTransform(object)
  const base = object.userData.baseRotation as THREE.Euler
  object.rotation.z = base.z + amount
}

function setObjectScale(object: THREE.Object3D | null, scale: number) {
  if (!object) return
  ensureBaseTransform(object)
  const base = object.userData.baseScale as THREE.Vector3
  object.scale.set(base.x * scale, base.y * scale, base.z * scale)
}

function tintObject(object: THREE.Object3D | null, color: THREE.Color, emissiveIntensity = 0, opacity?: number) {
  object?.traverse(child => {
    if (!isMesh(child)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach(material => {
      const tintable = material as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color }
      tintable.color?.copy(color)
      tintable.emissive?.copy(color).multiplyScalar(emissiveIntensity)
      if (opacity !== undefined) {
        material.transparent = true
        material.opacity = opacity
      }
    })
  })
}

function setMaterialOpacity(mesh: THREE.Mesh, opacity: number) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  materials.forEach(material => {
    material.transparent = true
    material.opacity = opacity
  })
}

function normalizeMeshMaterial(mesh: THREE.Mesh, pathName = mesh.name.toLowerCase()) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  materials.forEach(material => {
    const visualMaterial = material as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; toneMapped?: boolean }
    if (pathName.includes('heatedreservoir')) {
      visualMaterial.color?.set('#d26a2a')
      visualMaterial.emissive?.set('#ff7a2e')
      visualMaterial.emissiveIntensity = 2.75
      visualMaterial.toneMapped = false
    }
    if (pathName.includes('steam')) {
      visualMaterial.color?.set('#f4fdff')
      visualMaterial.emissive?.set('#bff5ff')
      visualMaterial.emissiveIntensity = 2.15
      visualMaterial.toneMapped = false
    }
    if (pathName.includes('oil')) {
      visualMaterial.color?.set(pathName.includes('arrow') ? '#cc8a2e' : '#2b1a0c')
    }
    material.needsUpdate = true
  })
}

function isGlowObject(pathName: string) {
  return pathName.includes('heatedreservoir') || pathName.includes('steam')
}

function fitObjectToScene(object: THREE.Object3D, targetSize: number) {
  const box = new THREE.Box3().setFromObject(object)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const largest = Math.max(size.x, size.y, size.z) || 1
  const scale = targetSize / largest
  object.scale.setScalar(scale)
  object.position.sub(center.multiplyScalar(scale))
}

function frameCameraToObject(twin: TwinScene, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)

  const maxSize = Math.max(size.x, size.y, size.z) || 1
  const halfFov = THREE.MathUtils.degToRad(twin.camera.fov * 0.5)
  const fitHeightDistance = maxSize / (2 * Math.tan(halfFov))
  const fitWidthDistance = fitHeightDistance / Math.max(0.1, twin.camera.aspect)
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.08
  const viewDirection = new THREE.Vector3(0.78, 0.38, 1).normalize()

  twin.camera.position.copy(center).add(viewDirection.multiplyScalar(distance))
  twin.camera.near = Math.max(0.05, distance / 120)
  twin.camera.far = distance * 8
  twin.camera.updateProjectionMatrix()
  twin.controls.target.copy(center).add(new THREE.Vector3(0, size.y * 0.03, 0))
  twin.controls.minDistance = distance * 0.42
  twin.controls.maxDistance = distance * 2.4
  twin.controls.update()
}

function disposeTwinScene(twin: TwinScene) {
  twin.disposed = true
  if (twin.animationFrame !== null) window.cancelAnimationFrame(twin.animationFrame)
  twin.resizeObserver?.disconnect()
  window.removeEventListener('resize', twin.resize)
  twin.controls.dispose()
  disposeObject(twin.scene)
  twin.composer.dispose()
  twin.bloomComposer.dispose()
  twin.environmentMap?.dispose()
  twin.renderer.dispose()
  twin.renderer.domElement.remove()
}

function disposeObject(object: THREE.Object3D) {
  object.traverse(child => {
    if (isMesh(child)) {
      child.geometry?.dispose()
      disposeMaterial(child.material)
    }
  })
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined) {
  if (!material) return
  const materials = Array.isArray(material) ? material : [material]
  materials.forEach(item => {
    Object.values(item).forEach(value => {
      if (value && typeof value === 'object' && 'isTexture' in value) {
        ;(value as THREE.Texture).dispose()
      }
    })
    item.dispose()
  })
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return 'isMesh' in object
}

function summarizeLiveRisk(risk: DigitalTwinProps['risk']) {
  if (!risk) return { score: 0, category: 'LOW' as RiskCategory }
  return Object.values(risk).reduce(
    (acc, item) => (item.risk_score > acc.score ? { score: clamp01(item.risk_score), category: item.category } : acc),
    { score: 0, category: 'LOW' as RiskCategory },
  )
}

function summarizePredictionRisk(predictions: Record<string, number> | undefined, fallbackScore: number, fallbackCategory: RiskCategory) {
  const values = [
    readNumber(predictions, 'rod_floating_risk'),
    readNumber(predictions, 'impact_loading_risk'),
    readNumber(predictions, 'pump_unsetting_risk'),
    readNumber(predictions, 'rod_failure_risk'),
  ].filter((value): value is number => value !== null)
  const score = values.length ? clamp01(Math.max(...values)) : fallbackScore
  return { score, category: riskCategory(score) ?? fallbackCategory }
}

function riskCategory(score: number): RiskCategory {
  if (score >= 0.35) return 'HIGH'
  if (score >= 0.2) return 'MEDIUM'
  return 'LOW'
}

function riskWarnings(score: number, category: RiskCategory) {
  if (category === 'HIGH') return [`Recommended case still has elevated synthetic risk (${Math.round(score * 100)}%).`]
  if (category === 'MEDIUM') return [`Recommended case has medium synthetic risk (${Math.round(score * 100)}%).`]
  return []
}

function rodAmplitudeFromBehavior(behavior: RodMovementBehavior, strokeLength: number | null) {
  const fromStroke = strokeLength !== null ? 0.14 + normalizeStrokeLength(strokeLength) * 0.42 : null
  if (fromStroke !== null) return fromStroke
  if (behavior === 'floating_risk') return 0.36
  if (behavior === 'impact_risk') return 0.48
  return 0.22
}

function readNumber(source: Record<string, number> | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function normalizeRange(value: number | null | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return (value - min) / (max - min)
}

function normalizeStageOneFlow(flowMagnitude: number) {
  return clamp01(flowMagnitude / 0.08)
}

function productionToDemoFlowSpeed(production: number) {
  return normalizeProduction(production) * 0.08
}

function normalizeProduction(production: number) {
  // Demo-only Baghewala synthetic-data range for visual flow, not a calibrated hydraulic conversion.
  return clamp01((production - 5) / (85 - 5))
}

function normalizeInjectionPressure(pressure: number) {
  // Demo-only synthetic range based on the current validated API envelope.
  return clamp01((pressure - 9.17) / (29.4 - 9.17))
}

function normalizeSteamVolume(steamVolume: number) {
  // Demo-only synthetic range based on the current validated API envelope.
  return clamp01((steamVolume - 454.86) / (1448.01 - 454.86))
}

function normalizeStrokeLength(strokeLength: number) {
  // Demo-only synthetic range based on the current validated API envelope.
  return clamp01((strokeLength - 38.5) / (71.5 - 38.5))
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function formatMetric(value: number) {
  return Number(value).toFixed(Math.abs(value) >= 100 ? 0 : 3)
}
