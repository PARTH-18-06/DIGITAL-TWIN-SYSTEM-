import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { ObservationImportPayload, ObservationImportPreview } from '../api/types'
import { buildImportPayloadKey, canConfirmImport, isSupportedCsvFile, MAX_CSV_BYTES } from '../lib/importWorkflow'

export function ObservationImportPanel({
  disabled,
  onImported,
}: {
  disabled: boolean
  onImported: () => void
}) {
  const [datasetId, setDatasetId] = useState(`field-data-${new Date().toISOString().slice(0, 10)}`)
  const [source, setSource] = useState('operator-upload')
  const [dataKind, setDataKind] = useState<ObservationImportPayload['data_kind']>('field_measurement')
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<ObservationImportPreview | null>(null)
  const [previewPayloadKey, setPreviewPayloadKey] = useState('')
  const [message, setMessage] = useState('')
  const [writesEnabled, setWritesEnabled] = useState(false)
  const [writeProtectionMessage, setWriteProtectionMessage] = useState('Production import confirmation is unavailable here. Use dry-run preview only.')
  const [busy, setBusy] = useState(false)
  const requestSeq = useRef(0)

  const payload = (): ObservationImportPayload => ({ csv_text: csvText, dataset_id: datasetId, source, data_kind: dataKind })
  const currentPayloadKey = useMemo(() => buildImportPayloadKey(payload()), [csvText, datasetId, source, dataKind])
  const canConfirm = writesEnabled && canConfirmImport(preview, previewPayloadKey, currentPayloadKey)

  useEffect(() => {
    let active = true
    api.importRules()
      .then(rules => {
        if (!active) return
        setWritesEnabled(Boolean(rules.writes_enabled))
        if (typeof rules.write_protection_message === 'string') setWriteProtectionMessage(rules.write_protection_message)
      })
      .catch(() => {
        if (!active) return
        setWritesEnabled(false)
        setWriteProtectionMessage('Production import confirmation is unavailable here. Dry-run preview remains available.')
      })
    return () => { active = false }
  }, [])

  const clearValidationState = (nextMessage = '') => {
    requestSeq.current += 1
    setBusy(false)
    setPreview(null)
    setPreviewPayloadKey('')
    setMessage(nextMessage)
  }

  const dryRun = async () => {
    const requestId = requestSeq.current + 1
    requestSeq.current = requestId
    const requestPayload = payload()
    const requestKey = buildImportPayloadKey(requestPayload)
    setBusy(true); setMessage(''); setPreview(null); setPreviewPayloadKey('')
    try {
      const result = await api.dryRunObservationImport(requestPayload)
      if (requestSeq.current !== requestId || buildImportPayloadKey(payload()) !== requestKey) return
      setPreview(result)
      setPreviewPayloadKey(requestKey)
      setMessage(result.error_count
        ? 'Resolve errors before importing.'
        : writesEnabled
          ? 'Dry run complete. Review warnings before confirming.'
          : `Dry run complete. ${writeProtectionMessage}`)
    } catch (error) {
      if (requestSeq.current !== requestId) return
      setPreview(null)
      setPreviewPayloadKey('')
      setMessage(error instanceof ApiError ? error.message : 'Dry run failed')
    } finally {
      if (requestSeq.current === requestId) setBusy(false)
    }
  }

  const confirm = async () => {
    if (!canConfirm) return
    const requestId = requestSeq.current + 1
    requestSeq.current = requestId
    const requestPayload = payload()
    setBusy(true); setMessage('')
    try {
      const result = await api.confirmObservationImport(requestPayload)
      if (requestSeq.current !== requestId) return
      setPreview(result)
      setPreviewPayloadKey(buildImportPayloadKey(requestPayload))
      setMessage(`Import complete: ${result.imported_rows} imported, ${result.skipped_rows} skipped, ${result.rejected_rows} rejected.`)
      onImported()
    } catch (error) {
      if (requestSeq.current !== requestId) return
      setMessage(error instanceof ApiError ? error.message : 'Import failed')
    } finally {
      if (requestSeq.current === requestId) setBusy(false)
    }
  }

  return (
    <section className="panel wide import-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Future field data readiness</span>
          <h2>CSV observation import</h2>
        </div>
        <div className="import-links">
          <a className="button-link" href={api.importTemplateUrl()} download="well_observations_template.csv">Download template</a>
          <a className="button-link" href={api.importSyntheticSampleUrl()} download="well_observations_synthetic_sample.csv">Synthetic sample</a>
        </div>
      </div>
      <p className="muted">
        Dry-run validates the CSV before saving. Imports are local/dev only unless the backend explicitly enables them; user-supplied field measurements are not automatically verified or field-validated.
      </p>
      {!writesEnabled && <p className="optimizer-notice warning"><strong>Import confirmation disabled</strong><span>{writeProtectionMessage}</span></p>}

      <div className="import-grid">
        <label>
          <span>Dataset identifier</span>
          <input value={datasetId} onChange={event => { setDatasetId(event.target.value); clearValidationState() }} />
        </label>
        <label>
          <span>Source</span>
          <input value={source} onChange={event => { setSource(event.target.value); clearValidationState() }} />
        </label>
        <label>
          <span>Data kind</span>
          <select value={dataKind} onChange={event => { setDataKind(event.target.value as ObservationImportPayload['data_kind']); clearValidationState() }}>
            <option value="field_measurement">Field measurement (unverified)</option>
            <option value="synthetic_sample">Synthetic sample</option>
          </select>
        </label>
        <label>
          <span>CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={disabled}
            onChange={async event => {
              const file = event.target.files?.[0]
              setPreview(null); setPreviewPayloadKey(''); setMessage(''); setCsvText(''); requestSeq.current += 1; setBusy(false)
              if (!file) { setFileName(''); return }
              setFileName(file.name)
              if (!isSupportedCsvFile(file.name, file.type)) {
                setMessage('Only CSV files are supported. Choose a .csv file that follows the observation template.')
                return
              }
              if (file.size === 0) {
                setMessage('CSV file is empty. Add the template headers and at least one data row before validating.')
                return
              }
              if (file.size > MAX_CSV_BYTES) {
                setMessage(`CSV file is too large. Maximum allowed size is ${MAX_CSV_BYTES.toLocaleString()} bytes.`)
                return
              }
              setCsvText(await file.text())
            }}
          />
        </label>
      </div>

      <div className="import-actions">
        <button type="button" disabled={disabled || busy || !csvText || !datasetId || !source} onClick={dryRun}>
          {busy ? 'Checking...' : 'Dry-run preview'}
        </button>
        <button type="button" disabled={disabled || busy || !canConfirm} title={!writesEnabled ? writeProtectionMessage : undefined} onClick={confirm}>Confirm import</button>
        {fileName && <span>{fileName}</span>}
      </div>

      {message && <p className={preview?.error_count || (!preview && message) ? 'scenario-error' : 'muted'}>{message}</p>}
      {preview && <PreviewTable preview={preview} />}
    </section>
  )
}

function PreviewTable({ preview }: { preview: ObservationImportPreview }) {
  const issues = [...preview.errors.map(issue => ({ ...issue, type: 'Error' })), ...preview.warnings.map(issue => ({ ...issue, type: 'Warning' }))]
  return (
    <div className="import-preview">
      <div className="import-stats">
        <span>Total {preview.total_rows}</span>
        <span>Valid {preview.valid_rows}</span>
        <span>Importable {preview.importable_rows}</span>
        <span>Duplicates {preview.duplicate_rows}</span>
        <span>Errors {preview.error_count}</span>
        <span>Warnings {preview.warning_count}</span>
      </div>
      <details open={issues.length > 0}>
        <summary>Row-level issues</summary>
        {issues.length ? (
          <table>
            <thead><tr><th>Type</th><th>Row</th><th>Field</th><th>Message</th></tr></thead>
            <tbody>{issues.slice(0, 50).map((issue, index) => (
              <tr key={`${issue.type}-${issue.row}-${issue.field}-${index}`}><td>{issue.type}</td><td>{issue.row}</td><td>{issue.field}</td><td>{issue.message}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="muted">No errors or warnings.</p>}
      </details>
      <details>
        <summary>Preview rows</summary>
        <pre>{JSON.stringify(preview.preview_rows, null, 2)}</pre>
      </details>
    </div>
  )
}
