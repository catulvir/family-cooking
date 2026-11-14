import { expect, it } from 'vitest'
import { setIn } from 'formik'
import { recipeFormSchema, recipeValues, type RecipeValues } from './recipeFormSchema'

function valid(): RecipeValues {
  const values = recipeValues()
  values.name = 'Soup'
  values.ingredients[0] = { ...values.ingredients[0], name: 'Salt', quantity: '1/2', unit: 'tsp' }
  values.instructions[0].text = 'Mix.\nServe.'
  return values
}

it('allows optional blanks, free-text quantities, and exact content limits', async () => {
  await expect(recipeFormSchema.isValid(valid())).resolves.toBe(true)
  const values = valid()
  values.name = 'n'.repeat(200)
  values.servings = '999'
  values.notes = 'n'.repeat(5000)
  values.ingredients = Array.from({ length: 100 }, (_, index) => ({
    key: String(index),
    name: 'n'.repeat(200),
    quantity: 'q'.repeat(50),
    unit: 'u'.repeat(50),
  }))
  values.instructions = Array.from({ length: 100 }, (_, index) => ({
    key: String(index),
    text: 's'.repeat(2000),
  }))
  await expect(recipeFormSchema.isValid(values)).resolves.toBe(true)
})

it.each([
  ['name', 'n'.repeat(201)],
  ['servings', '0'],
  ['servings', '1000'],
  ['servings', '1.5'],
  ['notes', 'n'.repeat(5001)],
  ['ingredients[0].name', ' '],
  ['ingredients[0].name', 'n'.repeat(201)],
  ['ingredients[0].quantity', 'q'.repeat(51)],
  ['ingredients[0].unit', 'u'.repeat(51)],
  ['instructions[0].text', ' '],
  ['instructions[0].text', 's'.repeat(2001)],
])('rejects invalid %s content', async (path, value) => {
  await expect(
    recipeFormSchema.validateAt(path, setIn(valid(), path, value)),
  ).rejects.toMatchObject({ path })
})

it('rejects oversized ingredient and instruction lists', async () => {
  const values = valid()
  values.ingredients = Array(101).fill(values.ingredients[0])
  await expect(recipeFormSchema.validateAt('ingredients', values)).rejects.toThrow(
    'Use at most 100 ingredients.',
  )
  values.instructions = Array(101).fill(values.instructions[0])
  await expect(recipeFormSchema.validateAt('instructions', values)).rejects.toThrow(
    'Use at most 100 instruction steps.',
  )
})
