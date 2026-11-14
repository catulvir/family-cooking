import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useField, useFormikContext } from 'formik'

/** Keeps validation and the entire request inside one submission lock. */
export function AppForm({
  children,
  className = 'form',
  disabled = false,
}: {
  children: ReactNode
  className?: string
  disabled?: boolean
}) {
  const { submitForm, isSubmitting, errors, submitCount, setStatus } = useFormikContext()
  const locked = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const completedSubmission = useRef(0)
  useEffect(() => {
    if (!submitCount) {
      completedSubmission.current = 0
      return
    }
    if (isSubmitting || completedSubmission.current === submitCount) return
    completedSubmission.current = submitCount
    if (Object.keys(errors).length && !form.current?.closest('[hidden]'))
      form.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"], [data-error-focus="true"]')
        ?.focus()
  }, [errors, isSubmitting, submitCount])
  return (
    <form
      ref={form}
      className={className}
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        if (locked.current || disabled) return
        locked.current = true
        setStatus(undefined)
        try {
          await submitForm()
        } finally {
          locked.current = false
        }
      }}
    >
      {children}
    </form>
  )
}

type FieldProps = {
  name: string
  label: string
  as?: 'input' | 'textarea' | 'select'
  type?: string
  autoComplete?: string
  maxLength?: number
  children?: ReactNode
}

export function FormField({ name, label, as = 'input', children, ...props }: FieldProps) {
  const [field, meta] = useField<string>(name)
  const id = useId()
  const error = meta.touched && meta.error
  const shared = {
    ...field,
    id,
    'aria-invalid': !!error,
    'aria-describedby': error ? `${id}-error` : undefined,
  }
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {as === 'textarea' ? (
        <textarea {...shared} maxLength={props.maxLength} />
      ) : as === 'select' ? (
        <select {...shared}>{children}</select>
      ) : (
        <input {...shared} {...props} />
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

export function FormError() {
  const { status } = useFormikContext()
  return typeof status === 'string' ? (
    <p className="error" role="alert">
      {status}
    </p>
  ) : null
}
