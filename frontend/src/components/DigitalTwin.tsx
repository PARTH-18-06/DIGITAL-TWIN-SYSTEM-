import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
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

type VisualState = {
  wellName: string
  mode: TwinMode
  flowSpeed: number
  flowDirection: FlowDirection
  temperatureColorValue: number
  pressureIntensity: number
  pumpStrokeSpeed: number
  rodBehavior: RodMovementBehavior
  warnings: string[]
  maxRiskScore: number
  maxRiskCategory: RiskCategory
  production: number | null
  energy: number | null
  sor: number | null
  steamVolume: number | null
  injectionPressure: number | null
}

type TwinScene = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  reservoir: THREE.Mesh
  pressureShell: THREE.Mesh
  rod: THREE.Group
  pump: THREE.Group
  steamParticles: THREE.Points
  oilParticles: THREE.Points
  riskHalo: THREE.Mesh
  glbRoot: THREE.Object3D | null
  resize: () => void
  resizeObserver: ResizeObserver | null
  animationFrame: number | null
  disposed: boolean
  canvasCount: number
}

const MODEL_URL = '/models/well.glb'
const DEFAULT_VISUAL_STATE: VisualState = {
  wellName: 'No well selected',
  mode: 'current',
  flowSpeed: 0.25,
  flowDirection: 'stalled',
  temperatureColorValue: 0.35,
  pressureIntensity: 0.35,
  pumpStrokeSpeed: 0.4,
  rodBehavior: 'normal',
  warnings: ['Select a real BGH well and run simulation to animate live operating state.'],
  maxRiskScore: 0,
  maxRiskCategory: 'LOW',
  production: null,
  energy: null,
  sor: null,
  steamVolume: null,
  injectionPressure: null,
}

export function DigitalTwin(props: DigitalTwinProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<TwinScene | null>(null)
  const visualRef = useRef<VisualState>(DEFAULT_VISUAL_STATE)
  const [isRunning, setIsRunning] = useState(true)
  const runningRef = useRef(true)
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(1)
  const [modelStatus, setModelStatus] = useState<'loading' | 'loaded' | 'fallback'>('loading')
  const [webglError, setWebglError] = useState('')
  const [renderStats, setRenderStats] = useState({ fps: 0, glbLoadMs: 0, canvasCount: 0 })

  const visualState = useMemo(() => deriveVisualState(props), [props])

  useEffect(() => {
    visualRef.current = visualState
    applyVisualState(sceneRef.current, visualState)
  }, [visualState])

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
    setRenderStats(stats => ({ ...stats, canvasCount: twin.canvasCount }))
    applyVisualState(twin, visualRef.current)

    const startedAt = performance.now()
    new GLTFLoader().load(
      MODEL_URL,
      gltf => {
        if (twin.disposed) return
        const root = gltf.scene
        root.name = 'AbhishekWellGLB'
        fitObjectToScene(root, 5.2)
        root.position.set(0, 0, 0)
        root.traverse(child => {
          if ('isMesh' in child) {
            const mesh = child as THREE.Mesh
            mesh.castShadow = true
            mesh.receiveShadow = true
          }
        })
        twin.scene.add(root)
        twin.glbRoot = root
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
    let lastStatsAt = performance.now()
    let previousFrameAt = performance.now()
    const animationStartedAt = previousFrameAt

    const render = () => {
      if (twin.disposed) return
      const frameAt = performance.now()
      const delta = Math.min((frameAt - previousFrameAt) / 1000, 0.05)
      previousFrameAt = frameAt
      if (runningRef.current) {
        animateTwin(twin, visualRef.current, delta, (frameAt - animationStartedAt) / 1000, speedRef.current)
      }
      twin.controls.update()
      twin.renderer.render(twin.scene, twin.camera)
      frameCount += 1

      const now = performance.now()
      if (now - lastStatsAt > 1500) {
        setRenderStats(stats => ({
          ...stats,
          fps: Math.round((frameCount * 1000) / (now - lastStatsAt)),
          canvasCount: container.querySelectorAll('canvas').length,
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
      ? `well.glb loaded${renderStats.glbLoadMs ? ` in ${renderStats.glbLoadMs} ms` : ''}`
      : 'Using procedural fallback while model asset is unavailable'

  return (
    <section className="dt-embed" aria-label="Three.js digital twin visualization">
      <div className="dt-embed-head">
        <div>
          <span className="eyebrow">Three.js digital twin</span>
          <h2>{visualState.wellName}</h2>
        </div>
        <span className={`dt-embed-mode ${visualState.mode}`}>{visualState.mode === 'optimized' ? 'AI recommended' : 'Current'}</span>
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
          <span className={`dt-flow-badge ${visualState.flowDirection}`}>{visualState.flowDirection} flow</span>
          <span>Speed {formatMetric(visualState.flowSpeed)}</span>
          <span>Temp {Math.round(visualState.temperatureColorValue * 100)}%</span>
          <span>Pressure {Math.round(visualState.pressureIntensity * 100)}%</span>
        </div>
      </div>

      <div className="dt-embed-controls">
        <div className="dt-embed-action-row">
          <button type="button" onClick={() => setIsRunning(value => !value)}>{isRunning ? 'Pause' : 'Start'}</button>
          <button type="button" onClick={() => { setSpeed(1); applyVisualState(sceneRef.current, visualState) }}>Reset</button>
          <label className="dt-speed">
            Speed
            <input min="0.25" max="2.5" step="0.25" type="range" value={speed} onChange={event => setSpeed(Number(event.target.value))} />
            <span>{speed.toFixed(2)}x</span>
          </label>
        </div>
        <small className="dt-running-state">{statusText} | {renderStats.fps || '--'} fps | canvases: {renderStats.canvasCount || '--'}</small>
      </div>

      <div className="dt-embed-metrics">
        <Metric label="Production" value={visualState.production} suffix=" bbl/d" />
        <Metric label="Energy" value={visualState.energy} suffix=" /bbl" />
        <Metric label="SOR" value={visualState.sor} />
        <Metric label="Steam" value={visualState.steamVolume} suffix=" m³" />
      </div>

      <div className="dt-risk-strip">
        <span className={`dt-risk-pill ${visualState.maxRiskCategory.toLowerCase()}`}>
          Max risk {visualState.maxRiskCategory} {Math.round(visualState.maxRiskScore * 100)}%
        </span>
        <span>Rod behavior: {visualState.rodBehavior.replace('_', ' ')}</span>
        {visualState.injectionPressure !== null && <span>Injection {formatMetric(visualState.injectionPressure)}</span>}
      </div>

      {visualState.warnings.length > 0 && (
        <div className="dt-embed-warnings">
          {visualState.warnings.map(warning => <span key={warning}>{warning}</span>)}
        </div>
      )}
    </section>
  )
}

function Metric({ label, suffix = '', value }: { label: string; suffix?: string; value: number | null }) {
  return <div className="dt-embed-metric"><span>{label}</span><strong>{value === null ? '-' : `${formatMetric(value)}${suffix}`}</strong></div>
}

function deriveVisualState({ mode, optimization, risk, simulation, well }: DigitalTwinProps): VisualState {
  const predictionSource = mode === 'optimized' ? optimization?.predictions.recommended : optimization?.predictions.current
  const recommended = mode === 'optimized' ? optimization?.recommendedParameters : null
  const riskEntries = risk ? Object.values(risk) : []
  const riskiest = riskEntries.reduce(
    (acc, item) => (item.risk_score > acc.risk_score ? item : acc),
    { risk_score: 0, category: 'LOW' as RiskCategory },
  )

  return {
    wellName: well?.well_name ?? DEFAULT_VISUAL_STATE.wellName,
    mode,
    flowSpeed: Math.max(0, simulation?.flow_speed ?? DEFAULT_VISUAL_STATE.flowSpeed),
    flowDirection: simulation?.flow_direction ?? DEFAULT_VISUAL_STATE.flowDirection,
    temperatureColorValue: clamp01(simulation?.temperature_color_value ?? normalizeRange(well?.reservoir_temperature, 40, 155, DEFAULT_VISUAL_STATE.temperatureColorValue)),
    pressureIntensity: clamp01(simulation?.pressure_intensity ?? normalizeRange(well?.reservoir_pressure, 2, 6, DEFAULT_VISUAL_STATE.pressureIntensity)),
    pumpStrokeSpeed: Math.max(0.1, simulation?.pump_stroke_speed ?? recommended?.rpm_or_spm ?? DEFAULT_VISUAL_STATE.pumpStrokeSpeed),
    rodBehavior: simulation?.rod_movement_behavior ?? (riskiest.category === 'HIGH' ? 'impact_risk' : DEFAULT_VISUAL_STATE.rodBehavior),
    warnings: simulation?.warnings?.length ? simulation.warnings : DEFAULT_VISUAL_STATE.warnings,
    maxRiskScore: clamp01(riskiest.risk_score),
    maxRiskCategory: riskiest.category,
    production: readNumber(predictionSource, 'oil_production', 'predicted_oil_flow_rate', 'oil_flow_rate'),
    energy: readNumber(predictionSource, 'energy_per_barrel'),
    sor: readNumber(predictionSource, 'steam_oil_ratio', 'sor'),
    steamVolume: recommended?.steam_volume ?? null,
    injectionPressure: recommended?.steam_injection_pressure ?? null,
  }
}

function createTwinScene(container: HTMLDivElement): TwinScene {
  const canvasCountBefore = container.querySelectorAll('canvas').length
  const scene = new THREE.Scene()
  scene.name = 'BaghewalaDigitalTwinScene'
  scene.background = new THREE.Color('#10191b')
  scene.fog = new THREE.FogExp2('#10191b', 0.05)

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  camera.position.set(6.2, 3.4, 7.2)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  container.replaceChildren(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 5
  controls.maxDistance = 13
  controls.target.set(0, -1.6, 0)

  scene.add(new THREE.HemisphereLight('#e7fbff', '#3d3022', 1.35))
  const key = new THREE.DirectionalLight('#fff2d3', 2.6)
  key.position.set(5, 7, 4)
  key.castShadow = true
  scene.add(key)
  const fill = new THREE.DirectionalLight('#7ed8dd', 1.0)
  fill.position.set(-4, 2, -3)
  scene.add(fill)

  const grid = new THREE.GridHelper(9, 18, '#6f7b72', '#314146')
  scene.add(grid)

  const model = createProceduralWellModel()
  scene.add(model.root)

  let twin: TwinScene
  const resize = () => {
    if (twin.disposed) return
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  twin = {
    scene,
    camera,
    renderer,
    controls,
    reservoir: model.reservoir,
    pressureShell: model.pressureShell,
    rod: model.rod,
    pump: model.pump,
    steamParticles: model.steamParticles,
    oilParticles: model.oilParticles,
    riskHalo: model.riskHalo,
    glbRoot: null,
    resize,
    resizeObserver: null,
    animationFrame: null,
    disposed: false,
    canvasCount: canvasCountBefore + 1,
  }

  twin.resizeObserver = new ResizeObserver(resize)
  twin.resizeObserver.observe(container)
  window.addEventListener('resize', resize)
  resize()

  return twin
}

function createProceduralWellModel() {
  const root = new THREE.Group()
  root.name = 'ProceduralBaghewalaWellFallback'

  const reservoirMaterial = new THREE.MeshStandardMaterial({ color: '#92542c', roughness: 0.65, metalness: 0.05, transparent: true, opacity: 0.74 })
  const reservoir = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 3.15, 0.72, 64), reservoirMaterial)
  reservoir.position.y = -3.1
  reservoir.receiveShadow = true
  root.add(reservoir)

  const pressureShell = new THREE.Mesh(
    new THREE.SphereGeometry(2.05, 40, 22),
    new THREE.MeshStandardMaterial({ color: '#2aa7a7', emissive: '#134947', transparent: true, opacity: 0.24, wireframe: true }),
  )
  pressureShell.scale.y = 0.35
  pressureShell.position.y = -2.85
  root.add(pressureShell)

  const casing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 6.3, 32),
    new THREE.MeshStandardMaterial({ color: '#c8d0ca', metalness: 0.7, roughness: 0.25 }),
  )
  casing.position.y = -0.35
  casing.castShadow = true
  root.add(casing)

  const tubing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 6.7, 24),
    new THREE.MeshStandardMaterial({ color: '#eef3e8', metalness: 0.55, roughness: 0.22 }),
  )
  tubing.position.y = -0.35
  root.add(tubing)

  const rod = new THREE.Group()
  const rodMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 5.45, 18),
    new THREE.MeshStandardMaterial({ color: '#f1d47c', emissive: '#2c2007', metalness: 0.4, roughness: 0.35 }),
  )
  rodMesh.position.y = -0.2
  rod.add(rodMesh)
  root.add(rod)

  const pump = new THREE.Group()
  const pumpBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.22, 0.18),
    new THREE.MeshStandardMaterial({ color: '#d66d3f', emissive: '#391508', metalness: 0.15, roughness: 0.5 }),
  )
  const counterWeight = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 24, 16),
    new THREE.MeshStandardMaterial({ color: '#f0bd76', metalness: 0.2, roughness: 0.45 }),
  )
  pumpBody.position.set(0, 2.35, 0)
  counterWeight.position.set(1.05, 2.15, 0)
  pump.add(pumpBody, counterWeight)
  root.add(pump)

  const steamParticles = createFlowParticles('#d9f4ff', -1.25)
  const oilParticles = createFlowParticles('#111111', 1.25)
  root.add(steamParticles, oilParticles)

  const riskHalo = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.04, 12, 64),
    new THREE.MeshBasicMaterial({ color: '#c7df78', transparent: true, opacity: 0.35 }),
  )
  riskHalo.position.set(0, -0.8, 0)
  riskHalo.rotation.x = Math.PI / 2
  root.add(riskHalo)

  return { root, reservoir, pressureShell, rod, pump, steamParticles, oilParticles, riskHalo }
}

function createFlowParticles(color: string, x: number) {
  const geometry = new THREE.BufferGeometry()
  const points = Array.from({ length: 72 }, (_, index) => {
    const y = -3 + (index / 71) * 5.7
    const angle = index * 1.618
    return [x + Math.cos(angle) * 0.08, y, Math.sin(angle) * 0.08]
  }).flat()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  const material = new THREE.PointsMaterial({ color, size: 0.055, transparent: true, opacity: 0.7, depthWrite: false })
  return new THREE.Points(geometry, material)
}

function animateTwin(twin: TwinScene, state: VisualState, delta: number, elapsed: number, speed: number) {
  const animationScale = speed * (0.35 + state.flowSpeed * 0.08)
  const direction = state.flowDirection === 'reverse' ? -1 : state.flowDirection === 'stalled' ? 0 : 1

  animateFlow(twin.steamParticles, delta * animationScale * Math.max(direction, 0.2))
  animateFlow(twin.oilParticles, delta * animationScale * direction)

  const pumpRate = Math.max(0.4, state.pumpStrokeSpeed / 4)
  const behaviorAmplitude = state.rodBehavior === 'normal' ? 0.22 : state.rodBehavior === 'floating_risk' ? 0.36 : 0.48
  twin.rod.position.y = Math.sin(elapsed * pumpRate * speed) * behaviorAmplitude
  twin.pump.rotation.z = Math.sin(elapsed * pumpRate * speed) * 0.16

  twin.reservoir.scale.setScalar(1 + state.temperatureColorValue * 0.05)
  twin.pressureShell.scale.set(1 + state.pressureIntensity * 0.28, 0.34 + state.pressureIntensity * 0.16, 1 + state.pressureIntensity * 0.28)
  twin.riskHalo.rotation.z += delta * speed * (0.6 + state.maxRiskScore)
}

function animateFlow(points: THREE.Points, offset: number) {
  const positions = points.geometry.getAttribute('position') as THREE.BufferAttribute
  for (let index = 1; index < positions.count * 3; index += 3) {
    let y = positions.array[index] as number
    y += offset
    if (y > 2.9) y = -3.0
    if (y < -3.0) y = 2.9
    positions.array[index] = y
  }
  positions.needsUpdate = true
}

function applyVisualState(twin: TwinScene | null, state: VisualState) {
  if (!twin) return
  const tempColor = new THREE.Color('#3f78c8').lerp(new THREE.Color('#ff7a35'), state.temperatureColorValue)
  const pressureColor = new THREE.Color('#1e6f72').lerp(new THREE.Color('#c7df78'), state.pressureIntensity)
  const riskColor = state.maxRiskCategory === 'HIGH' ? '#f05c3f' : state.maxRiskCategory === 'MEDIUM' ? '#f4b740' : '#c7df78'

  const reservoirMaterial = twin.reservoir.material as THREE.MeshStandardMaterial
  reservoirMaterial.color.copy(tempColor)
  reservoirMaterial.emissive.copy(tempColor).multiplyScalar(0.14)

  const shellMaterial = twin.pressureShell.material as THREE.MeshStandardMaterial
  shellMaterial.color.copy(pressureColor)
  shellMaterial.emissive.copy(pressureColor).multiplyScalar(0.45)
  shellMaterial.opacity = 0.18 + state.pressureIntensity * 0.32

  const riskMaterial = twin.riskHalo.material as THREE.MeshBasicMaterial
  riskMaterial.color.set(riskColor)
  riskMaterial.opacity = 0.25 + state.maxRiskScore * 0.5

  const steamMaterial = twin.steamParticles.material as THREE.PointsMaterial
  const oilMaterial = twin.oilParticles.material as THREE.PointsMaterial
  steamMaterial.opacity = state.flowDirection === 'stalled' ? 0.22 : 0.72
  oilMaterial.opacity = state.flowDirection === 'stalled' ? 0.18 : state.flowDirection === 'reverse' ? 0.42 : 0.76
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

function disposeTwinScene(twin: TwinScene) {
  twin.disposed = true
  if (twin.animationFrame !== null) window.cancelAnimationFrame(twin.animationFrame)
  twin.resizeObserver?.disconnect()
  window.removeEventListener('resize', twin.resize)
  twin.controls.dispose()
  twin.scene.traverse(object => {
    if ('geometry' in object) {
      ;(object as THREE.Mesh).geometry?.dispose()
    }
    if ('material' in object) {
      disposeMaterial((object as THREE.Mesh).material)
    }
  })
  twin.renderer.dispose()
  twin.renderer.domElement.remove()
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

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function formatMetric(value: number) {
  return Number(value).toFixed(Math.abs(value) >= 100 ? 0 : 2)
}
