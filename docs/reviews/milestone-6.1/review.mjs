// Headless browser smoke review with synthetic API responses; no family data is used.
import { createRequire } from 'node:module'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = await mkdtemp(join(tmpdir(), 'family-cooking-6.1-'))
console.log(`Review artifacts: ${output}`)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    let recipe
    let writes = 0
    await page.route('**/api/v1/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      let data
      let status = 200
      if (url.pathname === '/api/v1/auth/me') data = { email: 'review@example.com', role: 'MEMBER', status: 'ACTIVE', mustChangePassword: false }
      else if (url.pathname === '/api/v1/auth/csrf') data = { token: 'review-csrf' }
      else if (url.pathname === '/api/v1/dishes') data = []
      else if (url.pathname.startsWith('/api/v1/recipes') && ['POST', 'PUT'].includes(request.method())) {
        assert.equal(request.headers()['x-csrf-token'], 'review-csrf')
        writes++
        recipe = { ...request.postDataJSON(), id: 'recipe-1', createdBy: 'review-member', createdAt: '2026-11-14T10:00:00Z', updatedAt: '2026-11-14T10:00:00Z', version: writes - 1, canEdit: true }
        data = recipe; status = request.method() === 'POST' ? 201 : 200
      } else if (url.pathname === '/api/v1/recipes') data = { items: recipe ? [recipe] : [], page: 0, size: 20, totalElements: recipe ? 1 : 0, totalPages: recipe ? 1 : 0 }
      else if (url.pathname === '/api/v1/recipes/recipe-1') data = recipe
      else throw new Error(`Unexpected route: ${url.pathname}`)
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    })
    async function capture(label) {
      const dimensions = await page.evaluate(() => ({ width: window.innerWidth, content: document.documentElement.scrollWidth }))
      assert(dimensions.content <= dimensions.width, `${width} ${label}: horizontal overflow`)
      const targets = await page.locator('button:visible').evaluateAll(buttons => buttons.map(button => ({ text: button.textContent.trim(), height: button.getBoundingClientRect().height })))
      assert(targets.every(target => target.height >= 44), `${width} ${label}: undersized action`)
      await page.screenshot({ path: join(output, `${width}-${label}.png`), fullPage: true })
      results.push({ width, label, ...dimensions, targets })
    }
    await page.goto(process.env.REVIEW_URL || 'http://127.0.0.1:5175')
    await page.getByRole('button', { name: 'Recipes', exact: true }).click()
    await page.getByText('No recipes yet. Add your first family recipe.').waitFor()
    await capture('empty')
    await page.getByRole('button', { name: 'New recipe' }).click()
    await page.getByRole('button', { name: 'Save recipe' }).click()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-invalid') === 'true')
    assert(await page.getByLabel('Recipe name').evaluate(element => document.activeElement === element))
    await capture('validation')
    await page.getByLabel('Recipe name').fill('Roasted pumpkin soup with homemade stock and garden herbs')
    await page.getByLabel('Servings (optional)').fill('4')
    await page.getByLabel('Ingredient 1', { exact: true }).fill('Pumpkin')
    await page.getByLabel('Quantity 1 (optional)').fill('1/2')
    await page.getByLabel('Unit 1 (optional)').fill('kg')
    await page.getByRole('button', { name: 'Add ingredient', exact: true }).click()
    await page.getByLabel('Ingredient 2', { exact: true }).fill('Homemade vegetable stock')
    await page.getByLabel('Step 1', { exact: true }).fill('Roast the pumpkin until soft.')
    await page.getByRole('button', { name: 'Add step', exact: true }).click()
    await page.getByLabel('Step 2', { exact: true }).fill('Add stock and blend.\nServe warm with herbs.')
    await capture('form')
    await page.getByRole('button', { name: 'Journal', exact: true }).click()
    await page.getByRole('button', { name: 'Recipes', exact: true }).click()
    assert.equal(await page.getByLabel('Ingredient 2', { exact: true }).inputValue(), 'Homemade vegetable stock')
    await page.getByRole('button', { name: 'Save recipe' }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('heading', { name: recipe?.name || 'Roasted pumpkin soup with homemade stock and garden herbs' }).waitFor()
    assert.equal(writes, 1)
    await capture('detail')
    await page.getByRole('button', { name: 'Edit recipe' }).click()
    await page.getByLabel('Recipe name').fill('Changed draft')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert(await page.getByRole('button', { name: 'Keep editing' }).evaluate(element => document.activeElement === element))
    await page.keyboard.press('Escape')
    assert(await page.getByRole('button', { name: 'Cancel', exact: true }).evaluate(element => document.activeElement === element))
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await page.getByRole('button', { name: 'Edit recipe' }).waitFor()
    await page.getByRole('button', { name: 'Back to recipes' }).click()
    await page.getByRole('button', { name: recipe.name, exact: true }).waitFor()
    await capture('library')
    await page.reload()
    await page.getByRole('button', { name: 'Recipes', exact: true }).click()
    await page.getByRole('button', { name: recipe.name, exact: true }).click()
    await page.getByRole('heading', { name: recipe.name }).waitFor()
    assert.deepEqual(errors, [])
    await context.close()
  }
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`Passed ${results.length} captures across three widths.`)
} finally {
  await browser.close()
}
