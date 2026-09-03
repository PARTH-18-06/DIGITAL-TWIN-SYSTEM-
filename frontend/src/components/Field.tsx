import type { InputHTMLAttributes } from 'react'

export function Field({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return <label className="field"><span>{label}</span><input type="number" step="any" {...props} aria-invalid={!!error} />{error && <small className="field-error">{error}</small>}</label>
}
