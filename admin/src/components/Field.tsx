import { useId, type ReactNode } from 'react'

type Common = { label: string; hint?: ReactNode; error?: string }

type InputProps = Common & {
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'email' | 'url' | 'number' | 'password' | 'datetime-local'
  placeholder?: string
  autoComplete?: string
  required?: boolean
}

export function TextField({ label, hint, error, value, onChange, type = 'text', placeholder, autoComplete, required }: InputProps) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-help` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {(hint || error) && (
        <p id={`${id}-help`} className={error ? 'field__error' : 'field__hint'}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

type AreaProps = Common & { value: string; onChange: (value: string) => void; rows?: number; placeholder?: string }

export function TextArea({ label, hint, error, value, onChange, rows = 3, placeholder }: AreaProps) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-help` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {(hint || error) && (
        <p id={`${id}-help`} className={error ? 'field__error' : 'field__hint'}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

type SelectProps = Common & {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}

export function SelectField({ label, hint, error, value, onChange, options }: SelectProps) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {(hint || error) && <p className={error ? 'field__error' : 'field__hint'}>{error || hint}</p>}
    </div>
  )
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden="true" />
      {label}
    </label>
  )
}
