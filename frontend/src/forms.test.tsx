import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FormikProvider, useFormik } from 'formik'
import { expect, it, vi } from 'vitest'
import { AppForm, FormField } from './forms'

function FormHarness({ disabled = false, onSave }: { disabled?: boolean; onSave: () => void }) {
  const formik = useFormik({
    initialValues: { name: '' },
    validate: (values) => (values.name ? {} : { name: 'Enter a name.' }),
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: (_, helpers) => {
      onSave()
      helpers.resetForm()
    },
  })
  return (
    <FormikProvider value={formik}>
      <AppForm disabled={disabled}>
        <FormField name="name" label="Name" />
        <button>Save</button>
      </AppForm>
    </FormikProvider>
  )
}

it('focuses validation again after a successful save resets the submission count', async () => {
  const onSave = vi.fn<() => void>()
  render(<FormHarness onSave={onSave} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus())
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Valid' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''))
  screen.getByRole('button', { name: 'Save' }).focus()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus())
  expect(onSave).toHaveBeenCalledTimes(1)
})

it('blocks form submission while an external operation disables the form', async () => {
  const onSave = vi.fn<() => void>()
  const { rerender } = render(<FormHarness disabled onSave={onSave} />)
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Valid' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
  expect(onSave).not.toHaveBeenCalled()
  rerender(<FormHarness onSave={onSave} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
})
