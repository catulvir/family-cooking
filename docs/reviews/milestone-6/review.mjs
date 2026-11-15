// Live integration review. Run ONLY against an isolated local review database.
// Creates synthetic accounts, tags, recipes and meals through the real API/UI.
import { createRequire } from 'node:module'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.REVIEW_URL || 'http://localhost:8086'
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local review server only')
assert.equal(process.env.REVIEW_ISOLATED_DATABASE, 'yes', 'Confirm isolated fixture database')
const output = await mkdtemp(join(tmpdir(), 'family-cooking-6.6-'))
console.log(`Review artifacts: ${output}`)
const run = Date.now().toString(36)
const password = 'Local-review-password-6!'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
const errors = []
const contexts = []
async function context() {
  const value = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  contexts.push(value)
  value.on('page', page => {
    page.setDefaultTimeout(10000)
    page.on('pageerror', error => errors.push(error.message))
  })
  return value
}
async function api(ctx, path, method = 'GET', data, status = 200) {
  const headers = {}
  if (method !== 'GET') {
    const csrf = await ctx.request.get(`${base}/api/v1/auth/csrf`)
    headers['X-CSRF-TOKEN'] = (await csrf.json()).token
  }
  const response = await ctx.request.fetch(`${base}/api/v1${path}`, { method, data, headers })
  assert.equal(response.status(), status, `${method} ${path}: ${await response.text()}`)
  return response.status() === 204 ? null : response.json()
}
async function key(page, name) {
  await page.getByRole('button', { name, exact: true }).focus()
  await page.keyboard.press('Enter')
}
async function search(page, name) {
  await page.getByLabel('Search recipes by name').fill(name)
  const response = page.waitForResponse(r => r.url().includes('/api/v1/recipes?') && r.request().method() === 'GET')
  await page.getByLabel('Search recipes by name').press('Enter')
  await response
}
async function openRecipe(page, name) {
  await key(page, 'Recipes')
  await search(page, name)
  await key(page, name)
  await page.getByRole('heading', { name, exact: true }).waitFor()
}
async function capture(page, label, fullPage = true) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    content: document.documentElement.scrollWidth,
    targets: [...document.querySelectorAll('button, .tag-options label')]
      .filter(el => el.getClientRects().length > 0)
      .map(el => ({ text: el.textContent.trim(), height: el.getBoundingClientRect().height })),
    focus: document.activeElement?.textContent?.slice(0, 100),
    statuses: [...document.querySelectorAll('output, [role="alert"]')]
      .filter(el => el.getClientRects().length > 0).map(el => el.textContent),
  }))
  assert(metrics.content <= metrics.width, `${label}: horizontal overflow ${metrics.content}/${metrics.width}`)
  assert(metrics.targets.every(t => t.height >= 44), `${label}: undersized actions ${JSON.stringify(metrics.targets.filter(t => t.height < 44))}`)
  await page.screenshot({ path: join(output, `${label}.png`), fullPage })
  results.push({ label, ...metrics })
  console.log(`PASS ${label}`)
}
const input = recipe => ({
  name: recipe.name, servings: recipe.servings, notes: recipe.notes,
  ingredients: recipe.ingredients, instructions: recipe.instructions,
  version: recipe.version, tagIds: recipe.tags.map(tag => tag.id),
})
try {
  const signedOut = await context()
  const loginPage = await signedOut.newPage()
  await loginPage.goto(base)
  await loginPage.getByRole('button', { name: 'Sign in', exact: true }).waitFor()
  await capture(loginPage, '1280-packaged-sign-in')
  assert.equal((await signedOut.request.get(`${base}/api/v1/recipes`)).status(), 401)
  await loginPage.close()
  const admin = await context()
  const bootstrap = process.env.REVIEW_ADMIN_PASSWORD || 'Review-bootstrap-6!'
  let response = await api(admin, '/auth/login', 'POST', { email: 'admin@review.example', password: bootstrap })
  if (response.mustChangePassword) await api(admin, '/auth/change-password', 'POST', { currentPassword: bootstrap, newPassword: password })
  const owner = await context()
  const reader = await context()
  for (const [ctx, role] of [[owner, 'owner'], [reader, 'reader']]) {
    const created = await api(admin, '/admin/users', 'POST', { email: `${role}-${run}@review.example`, role: 'MEMBER' }, 201)
    await api(ctx, '/auth/login', 'POST', { email: created.email, password: created.temporaryPassword })
    await api(ctx, '/auth/change-password', 'POST', { currentPassword: created.temporaryPassword, newPassword: password })
  }
  const a = await owner.newPage()
  await a.goto(base)
  await key(a, 'Recipes')
  await a.getByRole('button', { name: 'New recipe' }).waitFor()
  if ((await api(owner, '/recipes')).totalElements === 0) {
    await a.getByText('No recipes yet. Add your first family recipe.').waitFor()
    await capture(a, '1280-empty-library')
  }
  // Member creates ordered content by keyboard; no synthetic responses.
  await key(a, 'New recipe')
  await key(a, 'Save recipe')
  await a.waitForFunction(() => document.activeElement?.getAttribute('aria-invalid') === 'true')
  await capture(a, '1280-validation')
  const name = `Garden soup ${run}`
  await a.getByLabel('Recipe name').fill(name)
  await a.getByLabel('Servings (optional)').fill('4')
  await a.getByLabel('Ingredient 1', { exact: true }).fill('Pumpkin')
  await a.getByLabel('Quantity 1 (optional)').fill('1/2')
  await a.getByLabel('Unit 1 (optional)').fill('kg')
  await key(a, 'Add ingredient')
  assert(await a.getByLabel('Ingredient 2', { exact: true }).evaluate(el => el === document.activeElement))
  await a.getByLabel('Ingredient 2', { exact: true }).fill('Stock')
  await key(a, 'Move ingredient 2 up')
  assert.equal(await a.getByLabel('Ingredient 1', { exact: true }).inputValue(), 'Stock')
  await a.getByLabel('Step 1', { exact: true }).fill('Roast pumpkin.')
  await key(a, 'Add step')
  await a.getByLabel('Step 2', { exact: true }).fill('Blend with stock.\nServe warm.')
  await key(a, 'Move step 2 up')
  await key(a, 'Add step')
  await key(a, 'Remove step 3')
  await key(a, 'Journal')
  await key(a, 'Recipes')
  assert.equal(await a.getByLabel('Ingredient 1', { exact: true }).inputValue(), 'Stock')
  const createdResponse = a.waitForResponse(r => r.url().endsWith('/recipes') && r.request().method() === 'POST')
  await key(a, 'Save recipe')
  const recipe = await (await createdResponse).json()
  assert.equal(recipe.ingredients[1].quantity, '1/2')
  assert.equal(recipe.instructions[0].text, 'Blend with stock.\nServe warm.')
  await a.getByRole('heading', { name, exact: true }).waitFor()
  await capture(a, '1280-member-created-recipe')
  // A real administrator creates, renames, selects tags and edits another member's recipe.
  const ad = await admin.newPage()
  await ad.goto(base)
  await key(ad, 'Recipes')
  await key(ad, 'Manage tags')
  const tagName = `Dinner ${run}`
  await ad.getByLabel('Tag name').fill(tagName)
  await key(ad, 'Create tag')
  await ad.getByRole('button', { name: `Rename ${tagName}` }).waitFor()
  await key(ad, `Rename ${tagName}`)
  const renamed = `Family dinner ${run}`
  await ad.getByLabel('Tag name').fill(renamed)
  await key(ad, 'Save tag')
  await ad.getByRole('button', { name: `Rename ${renamed}` }).waitFor()
  await capture(ad, '1280-admin-tags')
  await key(ad, 'Back to recipe')
  await search(ad, name)
  await key(ad, name)
  await key(ad, 'Edit recipe')
  await ad.getByLabel(renamed, { exact: true }).focus()
  await ad.keyboard.press('Space')
  await ad.getByLabel('Recipe notes (optional)').fill('Administrator added a family tag.')
  await key(ad, 'Save recipe')
  await ad.getByRole('heading', { name, exact: true }).waitFor()
  const updated = await api(owner, `/recipes/${recipe.id}`)
  assert.equal(updated.tags[0].name, renamed)
  // Stale member form vs a real concurrent administrator update.
  await key(a, 'Edit recipe')
  await a.getByLabel('Recipe notes (optional)').fill('Keep this local draft')
  await key(a, 'Save recipe')
  await a.getByRole('button', { name: 'Reload latest recipe' }).waitFor()
  assert.equal(await a.getByLabel('Recipe notes (optional)').inputValue(), 'Keep this local draft')
  await capture(a, '1280-real-version-conflict')
  await key(a, 'Reload latest recipe')
  await key(a, 'Keep editing')
  await key(a, 'Reload latest recipe')
  await key(a, 'Discard and reload')
  await a.getByText('Administrator added a family tag.').waitFor()
  // Another member can read/cook but cannot edit the recipe, including a direct request.
  const b = await reader.newPage()
  await b.goto(base)
  await openRecipe(b, name)
  assert.equal(await b.getByRole('button', { name: 'Edit recipe', exact: true }).count(), 0)
  assert.equal(await b.getByRole('button', { name: 'Manage tags', exact: true }).count(), 0)
  await api(reader, `/recipes/${recipe.id}`, 'PUT', { ...input(updated), name: 'Forbidden change' }, 403)
  await key(b, 'Back to recipes')
  await key(b, 'Filters (0)')
  await b.getByLabel(renamed, { exact: true }).focus()
  await b.keyboard.press('Space')
  await b.getByRole('button', { name: 'Clear tags' }).waitFor()
  await b.keyboard.press('Escape')
  assert(await b.getByRole('button', { name: 'Filters (1)' }).evaluate(el => el === document.activeElement))
  await key(b, name)
  await key(b, 'Record cooking this recipe')
  assert.equal(await b.getByLabel('Meal name').inputValue(), name)
  assert.equal(await b.getByLabel('Notes (optional)', { exact: true }).inputValue(), '')
  await key(b, 'Cancel')
  await b.getByRole('heading', { name, exact: true }).waitFor()
  await key(b, 'Record cooking this recipe')
  const mealName = `Family supper ${run}`
  await b.getByLabel('Meal name').fill(mealName)
  await b.getByLabel('Location (optional)').fill('Review kitchen')
  await b.getByLabel('Notes (optional)', { exact: true }).fill('A saved meal stays independent.')
  const mealResponse = b.waitForResponse(r => r.url().endsWith('/dishes') && r.request().method() === 'POST')
  await key(b, 'Save meal')
  const meal = await (await mealResponse).json()
  assert.equal(meal.recipe.id, recipe.id)
  await b.getByRole('heading', { name: mealName }).waitFor()
  await capture(b, '1280-linked-meal')
  await key(b, `View recipe: ${name}`)
  await key(b, 'Back to meal')
  assert(await b.getByRole('button', { name: `View recipe: ${name}` }).evaluate(el => el === document.activeElement))
  // Replace a changed meal draft only after an explicit choice and confirmation.
  await key(b, 'Edit meal')
  await b.getByLabel('Notes (optional)', { exact: true }).fill('Unsaved meal notes')
  await key(b, 'Recipes')
  // Library detail/discovery survives the linked preview.
  await key(b, 'Record cooking this recipe')
  await key(b, 'Continue existing meal')
  assert.equal(await b.getByLabel('Notes (optional)', { exact: true }).inputValue(), 'Unsaved meal notes')
  await key(b, 'Recipes')
  await key(b, 'Record cooking this recipe')
  await key(b, 'Start a new meal')
  await capture(b, '1280-protected-meal-draft')
  await key(b, 'Keep editing')
  await key(b, 'Start a new meal')
  await key(b, 'Discard changes')
  await key(b, 'Cancel')
  await key(b, 'Back to recipes')
  await key(b, 'Back to recipes')
  assert.equal(await b.getByLabel('Search recipes by name').inputValue(), name)
  await b.getByRole('button', { name: 'Remove ' + renamed + ' filter' }).waitFor()
  // New recipe name/current detail, unchanged previously saved meal snapshot.
  const current = await api(admin, `/recipes/${recipe.id}`)
  const latestName = `${name} revised`
  await api(admin, `/recipes/${recipe.id}`, 'PUT', { ...input(current), name: latestName })
  const savedMeal = await api(reader, `/dishes/${meal.id}`)
  assert.equal(savedMeal.name, mealName)
  assert.equal(savedMeal.notes, 'A saved meal stays independent.')
  assert.equal(savedMeal.recipe.name, latestName)
  await b.reload()
  await key(b, mealName)
  await key(b, `View recipe: ${latestName}`)
  await b.getByRole('heading', { name: latestName }).waitFor()
  await capture(b, '1280-persisted-current-recipe')
  // Seed a page boundary and maximum-size content via the same validated API.
  for (let n = 0; n < 21; n++) await api(owner, '/recipes', 'POST', {
    name: `Paging ${run} ${String(n).padStart(2, '0')}`, servings: null, notes: null,
    ingredients: [{ name: 'Water', quantity: null, unit: null }], instructions: [{ text: 'Stir.' }], tagIds: [],
  }, 201)
  const longName = `Long ${run} ` + 'GardenVegetables'.repeat(10)
  const long = await api(owner, '/recipes', 'POST', {
    name: longName, servings: 999, notes: 'UnbrokenFamilyNotes'.repeat(250),
    ingredients: Array.from({ length: 100 }, (_, n) => ({ name: `Ingredient ${n + 1} ` + 'LongName'.repeat(20), quantity: '1/2', unit: 'kg' })),
    instructions: Array.from({ length: 100 }, (_, n) => ({ text: `Step ${n + 1}. ` + 'LongInstruction'.repeat(100) })), tagIds: [updated.tags[0].id],
  }, 201)
  for (const width of [360, 768, 1280]) {
    const p = await owner.newPage()
    await p.setViewportSize({ width, height: 1000 })
    await p.goto(base)
    await key(p, 'Recipes')
    await search(p, `Paging ${run}`)
    await p.getByText('Page 1 of 2', { exact: true }).waitFor()
    await capture(p, `${width}-populated-paging`)
    await key(p, 'Next')
    await p.getByText('Page 2 of 2', { exact: true }).waitFor()
    assert(await p.getByRole('heading', { name: 'Recipes', exact: true }).evaluate(el => el === document.activeElement))
    await capture(p, `${width}-second-page`)
    await key(p, 'Filters (0)')
    await p.getByLabel(renamed, { exact: true }).check()
    await p.getByText('No recipes match. Try a different name or clear filters.').waitFor()
    await capture(p, `${width}-filters-no-match`)
    await key(p, 'Clear all')
    await search(p, longName)
    await key(p, longName)
    await p.getByRole('heading', { name: longName }).waitFor()
    await capture(p, `${width}-long-detail`, false)
    await key(p, 'Edit recipe')
    await p.getByLabel('Ingredient 100', { exact: true }).waitFor()
    assert(await p.getByRole('button', { name: 'Add ingredient', exact: true }).isDisabled())
    assert(await p.getByRole('button', { name: 'Add step', exact: true }).isDisabled())
    await capture(p, `${width}-100-row-editor`, false)
    await key(p, 'Cancel')
    await key(p, 'Record cooking this recipe')
    await key(p, 'Change recipe')
    await p.getByLabel('Find a recipe').fill(`Paging ${run}`)
    await p.getByLabel('Find a recipe').press('Enter')
    await p.getByText('Page 1 of 2', { exact: true }).waitFor()
    await capture(p, `${width}-meal-recipe-picker`)
    await key(p, 'Next recipes')
    await p.getByText('Page 2 of 2', { exact: true }).waitFor()
    await key(p, `Select Paging ${run} 20`)
    assert.equal(await p.getByLabel('Meal name').inputValue(), longName)
    await key(p, 'Clear recipe')
    await key(p, 'Cancel')
    await key(p, 'Discard changes')
    // Controlled response failure only here; all other requests remain live.
    await key(p, 'Back to recipes')
    await key(p, 'Back to recipes')
    await p.route('**/api/v1/recipes?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Review: recipe service temporarily unavailable.' }) }))
    await search(p, 'Temporary failure')
    await p.getByRole('alert').waitFor()
    await capture(p, `${width}-error-retry`)
    await p.unroute('**/api/v1/recipes?**')
    await key(p, 'Try again')
    await p.getByText('No recipes match. Try a different name or clear filters.').waitFor()
    await p.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(join(output, 'results.json'), JSON.stringify({ browser: browser.version(), results, errors, recipeId: recipe.id, longRecipeId: long.id }, null, 2))
  // Synthetic review credentials stay outside the source tree for a manual zoom pass.
  await writeFile(join(output, 'owner-state.json'), JSON.stringify(await owner.storageState()))
  console.log(`Passed ${results.length} captures and live integration assertions. Browser ${browser.version()}`)
} catch (error) {
  for (const [n, ctx] of contexts.entries()) {
    for (const [i, page] of ctx.pages().entries()) {
      console.log(`Page ${n}/${i}: ${page.url()} ${(await page.locator('body').innerText()).slice(0, 1500)}`)
      await page.screenshot({ path: join(output, `failure-${n}-${i}.png`), fullPage: true })
    }
  }
  throw error
} finally {
  await browser.close()
}
