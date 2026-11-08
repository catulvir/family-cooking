import { expect, it } from 'vitest'
import { mealSchema, passwordSchema } from './formSchemas'

it.each(['2025-02-29', '2026-04-31', '2026-13-01', '', '2026-1-01'])(
  'rejects invalid calendar date %s',
  async (preparedOn) => {
    await expect(mealSchema.validate({ name: 'Soup', preparedOn })).rejects.toThrow(
      'Enter a valid meal date.',
    )
  },
)

it('accepts a leap day without changing the date string', async () => {
  const values = await mealSchema.validate({
    name: 'Soup',
    preparedOn: '2028-02-29',
    location: '',
    notes: '',
  })
  expect(values.preparedOn).toBe('2028-02-29')
})

it('rejects a whitespace-only meal name', async () => {
  await expect(mealSchema.validate({ name: '   ', preparedOn: '2026-11-08' })).rejects.toThrow(
    'Enter a meal name.',
  )
})

it('enforces password length without trimming password characters', async () => {
  await expect(
    passwordSchema.validate({ currentPassword: 'old', newPassword: 'short' }),
  ).rejects.toThrow('Use at least 12 characters.')
  const values = await passwordSchema.validate({
    currentPassword: ' old ',
    newPassword: ' new password ',
  })
  expect(values).toEqual({ currentPassword: ' old ', newPassword: ' new password ' })
})
