export function DigitalTwinPlaceholder({ visualizationState }: { visualizationState?: string }) {
  return <section className="twin-slot"><div className="well-glyph"><span /><span /><span /></div><p>3D Digital Twin</p><small>{visualizationState || "Teammate's Three.js component goes here"}</small><div className="slot-label">Integration slot</div></section>
}
