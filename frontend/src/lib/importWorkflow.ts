import type { ObservationImportPayload, ObservationImportPreview } from '../api/types'

export const MAX_CSV_BYTES = 2_000_000

export function buildImportPayloadKey(payload: ObservationImportPayload): string {
  return JSON.stringify({
    csv_text: payload.csv_text,
    dataset_id: payload.dataset_id,
    source: payload.source,
    data_kind: payload.data_kind,
  })
}

export function isSupportedCsvFile(fileName: string, mimeType = ''): boolean {
  const name = fileName.toLowerCase()
  return name.endsWith('.csv') || mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel'
}

export function canConfirmImport(preview: ObservationImportPreview | null, previewKey: string, currentKey: string): boolean {
  return Boolean(preview && previewKey === currentKey && preview.error_count === 0 && preview.importable_rows > 0)
}
