import * as yup from 'yup'

const email = yup
  .string()
  .trim()
  .email('Enter a valid email address.')
  .required('Enter your email address.')
export const loginSchema = yup.object({
  email,
  password: yup.string().required('Enter your password.'),
})
export const passwordSchema = yup.object({
  currentPassword: yup.string().required('Enter your temporary password.'),
  newPassword: yup
    .string()
    .min(12, 'Use at least 12 characters.')
    .required('Enter a new password.'),
})
export const accountSchema = yup.object({
  email,
  role: yup.string<'ADMIN' | 'MEMBER'>().oneOf(['ADMIN', 'MEMBER']).required(),
})
export const mealSchema = yup.object({
  name: yup.string().trim().required('Enter a meal name.'),
  preparedOn: yup
    .string()
    .required('Enter a valid meal date.')
    .test('calendar-date', 'Enter a valid meal date.', (value) => {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
      const date = new Date(`${value}T00:00:00Z`)
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    }),
  location: yup.string().max(200, 'Use at most 200 characters.').default(''),
  notes: yup.string().max(5000, 'Use at most 5000 characters.').default(''),
})
export type MealValues = yup.InferType<typeof mealSchema>
