import assert from 'node:assert/strict'
import test from 'node:test'

import { buildImportPayloadKey, canConfirmImport, isSupportedCsvFile, MAX_CSV_BYTES } from '../src/lib/importWorkflow.ts'
import type { ObservationImportPayload, ObservationImportPreview } from '../src/api/types.ts'

const payload: ObservationImportPayload = {
  csv_text: 'well_identifier,observed_at\nBGH-001,2026-01-01T00:00:00Z\n',
  dataset_id: 'dataset-a',
  source: 'operator-upload',
  data_kind: 'field_measurement',
}

const cleanPreview: ObservationImportPreview = {
  dataset_id: 'dataset-a',
  source: 'operator-upload',
  data_kind: 'field_measurement',
  field_validated: false,
  total_rows: 1,
  valid_rows: 1,
  importable_rows: 1,
  duplicate_rows: 0,
  error_count: 0,
  warning_count: 0,
  errors: [],
  warnings: [],
  preview_rows: [],
  validated_rows: [],
  template_columns: [],
  required_columns: [],
  optional_columns: [],
}

test('CSV file guard accepts CSV names and rejects unsupported uploads before validation', () => {
  assert.equal(isSupportedCsvFile('observations.csv'), true)
  assert.equal(isSupportedCsvFile('export.CSV'), true)
  assert.equal(isSupportedCsvFile('observations.txt', 'text/plain'), false)
  assert.equal(MAX_CSV_BYTES, 2_000_000)
})

test('import confirmation is tied to the exact validated payload snapshot', () => {
  const validatedKey = buildImportPayloadKey(payload)
  const editedPayload = { ...payload, dataset_id: 'dataset-b' }
  const editedKey = buildImportPayloadKey(editedPayload)

  assert.equal(canConfirmImport(cleanPreview, validatedKey, validatedKey), true)
  assert.equal(canConfirmImport(cleanPreview, validatedKey, editedKey), false)
  assert.equal(canConfirmImport({ ...cleanPreview, error_count: 1 }, validatedKey, validatedKey), false)
  assert.equal(canConfirmImport({ ...cleanPreview, importable_rows: 0 }, validatedKey, validatedKey), false)
})
