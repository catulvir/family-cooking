import * as yup from 'yup'
import type { Recipe } from './api/recipes'

export interface RecipeValues {
  name: string
  servings: string
  notes: string
  ingredients: { key: string; name: string; quantity: string; unit: string }[]
  instructions: { key: string; text: string }[]
}

export const newIngredient = () => ({ key: crypto.randomUUID(), name: '', quantity: '', unit: '' })
export const newStep = () => ({ key: crypto.randomUUID(), text: '' })

export function recipeValues(recipe?: Recipe): RecipeValues {
  return {
    name: recipe?.name ?? '',
    servings: recipe?.servings?.toString() ?? '',
    notes: recipe?.notes ?? '',
    ingredients: recipe?.ingredients.map((item) => ({
      key: crypto.randomUUID(),
      name: item.name,
      quantity: item.quantity ?? '',
      unit: item.unit ?? '',
    })) ?? [newIngredient()],
    instructions: recipe?.instructions.map((step) => ({
      key: crypto.randomUUID(),
      text: step.text,
    })) ?? [newStep()],
  }
}

// Row keys keep DOM identity stable, but are neither saved content nor unsaved changes.
export function recipeContent(values: RecipeValues) {
  return {
    name: values.name,
    servings: values.servings,
    notes: values.notes,
    ingredients: values.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
    instructions: values.instructions.map(({ text }) => ({ text })),
  }
}

export const recipeFormSchema = yup.object({
  name: yup
    .string()
    .trim()
    .required('Enter a recipe name.')
    .max(200, 'Use at most 200 characters.'),
  servings: yup
    .string()
    .test(
      'servings',
      'Enter a whole number from 1 to 999.',
      (value) =>
        !value?.trim() ||
        (/^\d+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 999),
    ),
  notes: yup.string().trim().max(5000, 'Use at most 5000 characters.'),
  ingredients: yup
    .array()
    .of(
      yup.object({
        name: yup
          .string()
          .trim()
          .required('Enter an ingredient name.')
          .max(200, 'Use at most 200 characters.'),
        quantity: yup.string().trim().max(50, 'Use at most 50 characters.'),
        unit: yup.string().trim().max(50, 'Use at most 50 characters.'),
      }),
    )
    .min(1, 'Add at least one ingredient.')
    .max(100, 'Use at most 100 ingredients.')
    .required('Add at least one ingredient.'),
  instructions: yup
    .array()
    .of(
      yup.object({
        text: yup
          .string()
          .trim()
          .required('Enter an instruction.')
          .max(2000, 'Use at most 2000 characters.'),
      }),
    )
    .min(1, 'Add at least one instruction step.')
    .max(100, 'Use at most 100 instruction steps.')
    .required('Add at least one instruction step.'),
})
