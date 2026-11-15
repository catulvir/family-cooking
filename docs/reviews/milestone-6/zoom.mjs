// Actual Chrome page zoom companion to review.mjs, using an isolated profile.
// Set REVIEW_STATE to the external synthetic owner-state.json from that review.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
assert(process.env.REVIEW_STATE, 'Pass the synthetic review session file')
const output = dirname(process.env.REVIEW_STATE)
const base = process.env.REVIEW_URL || 'http://localhost:8086'
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const profile = await mkdtemp(join(tmpdir(), 'family-cooking-zoom-'))
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chrome', headless: true, viewport: null, args: ['--window-size=1280,1000'],
})
try {
  await context.addCookies(JSON.parse(await readFile(process.env.REVIEW_STATE, 'utf8')).cookies)
  const settings = context.pages()[0]
  await settings.goto('chrome://settings/appearance')
  await settings.locator('#zoomLevel').selectOption('1')
  const page = await context.newPage()
  await page.goto(base)
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  const initial = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }))
  await settings.locator('#zoomLevel').selectOption('2')
  await settings.close()
  await page.waitForFunction(dpr => devicePixelRatio >= dpr * 1.99, initial.dpr)
  const results = []
  async function capture(label) {
    const metrics = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth, dpr: devicePixelRatio }))
    assert(metrics.content <= metrics.width, `${label}: overflow`)
    assert(Math.abs(metrics.dpr / initial.dpr - 2) < .01, 'Exactly 200% browser zoom required')
    const cdp = await context.newCDPSession(page)
    const { contentSize } = await cdp.send('Page.getLayoutMetrics')
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: true,
      clip: { ...contentSize, scale: 1 },
    })
    await writeFile(join(output, `zoom-${label}.png`), Buffer.from(data, 'base64'))
    await cdp.detach()
    results.push({ label, ...metrics })
  }
  await capture('library')
  await page.getByRole('button', { name: 'Filters (0)' }).focus()
  await page.keyboard.press('Enter')
  await capture('filters')
  await page.getByLabel('Search recipes by name').fill('No matching recipe at zoom')
  await page.getByLabel('Search recipes by name').press('Enter')
  await page.getByText('No recipes match. Try a different name or clear filters.').waitFor()
  await capture('no-match')
  await page.getByRole('button', { name: 'New recipe' }).click()
  await page.getByLabel('Recipe name').fill('Zoom keyboard draft')
  await page.getByLabel('Ingredient 1', { exact: true }).fill('Pumpkin')
  await page.getByRole('button', { name: 'Add ingredient', exact: true }).focus()
  await page.keyboard.press('Enter')
  assert(await page.getByLabel('Ingredient 2', { exact: true }).evaluate(el => el === document.activeElement))
  await page.getByLabel('Ingredient 2', { exact: true }).fill('Stock')
  await page.getByRole('button', { name: 'Move ingredient 2 up' }).focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.getByLabel('Ingredient 1', { exact: true }).inputValue(), 'Stock')
  await capture('editor')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert(await page.getByRole('button', { name: 'Keep editing' }).evaluate(el => el === document.activeElement))
  await capture('discard')
  await page.keyboard.press('Escape')
  assert(await page.getByRole('button', { name: 'Cancel', exact: true }).evaluate(el => el === document.activeElement))
  await page.getByRole('button', { name: 'Journal', exact: true }).click()
  await page.getByRole('button', { name: 'Add meal' }).click()
  await page.getByRole('button', { name: 'Choose recipe' }).click()
  await page.getByRole('button', { name: 'Search recipes', exact: true }).waitFor()
  await capture('meal-picker')
  await writeFile(join(output, 'zoom-results.json'), JSON.stringify({ initial, results }, null, 2))
  console.log(`PASS actual 200% browser zoom: ${results.length} states`)
} finally {
  await context.close()
}
