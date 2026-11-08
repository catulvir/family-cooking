// Local browser review with synthetic API responses. No family data or backend writes.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = fileURLToPath(new URL('./screenshots/', import.meta.url))
await mkdir(output, { recursive: true })
const base = process.env.REVIEW_URL || 'http://127.0.0.1:5174'
const member = {
  email: 'member@example.com',
  role: 'MEMBER',
  status: 'ACTIVE',
  mustChangePassword: false,
}
const admin = {
  ...member,
  email: 'family.administrator.with.a.long.email.address@example.com',
  role: 'ADMIN',
}
const meal = {
  id: 'meal-1',
  name: 'Roasted pumpkin soup',
  preparedOn: '2026-11-08',
  location: 'Grandma’s kitchen',
  notes: 'Roast the pumpkin first.\nServe with sourdough and fresh herbs.',
  createdBy: 'member',
  createdAt: '2026-11-08T12:00:00Z',
  updatedAt: '2026-11-08T12:00:00Z',
  canEdit: true,
}
const longMeal = {
  ...meal,
  id: 'meal-2',
  name: 'Sunday supper with roasted vegetables, homemade sourdough and a very long family recipe name',
  location: 'A very long location: ' + 'LakesideKitchen'.repeat(10),
  notes: 'A long family cooking note. '.repeat(18) + '\n' + 'UnbrokenText'.repeat(22),
}
const users = [
  { ...admin, id: 'admin' },
  {
    ...member,
    id: 'member',
    email: 'averylongfamilymemberemailaddresswithoutseparators@example.com',
  },
]
const results = []
const failures = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const version = browser.version()
function check(condition, message) {
  if (!condition) failures.push(message)
}

async function capture(page, label, size) {
  const metrics = await page.evaluate(() => {
    const visible = (el) => el.checkVisibility() && el.getBoundingClientRect().width > 0
    const controls = [...document.querySelectorAll('button,input,select,textarea')].filter(visible)
    const shortTargets = controls
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.height < 43.9 || r.width < 43.9
      })
      .map((el) => el.textContent || el.getAttribute('name'))
    const clipped = controls
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.left < -1 || r.right > innerWidth + 1
      })
      .map((el) => el.textContent || el.getAttribute('name'))
    const rgb = (value) => (value.match(/[\d.]+/g) || []).map(Number)
    const luminance = (color) =>
      rgb(color)
        .slice(0, 3)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    const contrast = (a, b) =>
      (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
    const background = (element) => {
      for (let el = element; el; el = el.parentElement) {
        const color = getComputedStyle(el).backgroundColor
        if (rgb(color)[3] !== 0) return color
      }
      return 'rgb(255, 255, 255)'
    }
    const text = [
      ...document.querySelectorAll(
        'h1,h2,p,label,button,input,select,textarea,small,time,code,output,strong',
      ),
    ]
      .filter(visible)
      .map((el) => {
        const style = getComputedStyle(el)
        const ratio = contrast(style.color, background(el))
        const large =
          parseFloat(style.fontSize) >= 24 ||
          (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight) >= 700)
        return {
          label: (el.textContent?.trim() || el.getAttribute('name') || el.tagName).slice(0, 45),
          ratio: +ratio.toFixed(2),
          minimum: large ? 3 : 4.5,
        }
      })
    const boundaries = controls
      .filter((el) => !el.classList.contains('dish-link'))
      .map((el) => ({
        label: (el.textContent || el.getAttribute('name')).trim(),
        ratio: +contrast(getComputedStyle(el).borderTopColor, background(el.parentElement)).toFixed(
          2,
        ),
      }))
    return {
      width: innerWidth,
      outerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      scrollWidth: document.documentElement.scrollWidth,
      shortTargets,
      clipped,
      minimumTextContrast: Math.min(...text.map((x) => x.ratio)),
      lowContrast: text.filter((x) => x.ratio < x.minimum),
      minimumBoundaryContrast: Math.min(...boundaries.map((x) => x.ratio)),
      lowBoundaries: boundaries.filter((x) => x.ratio < 3),
      focused:
        document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute('name'),
    }
  })
  check(metrics.scrollWidth <= metrics.width, `${size}/${label}: horizontal overflow`)
  check(
    !metrics.shortTargets.length,
    `${size}/${label}: targets below 44px: ${metrics.shortTargets}`,
  )
  check(!metrics.clipped.length, `${size}/${label}: clipped controls: ${metrics.clipped}`)
  check(
    !metrics.lowContrast.length,
    `${size}/${label}: low text contrast: ${JSON.stringify(metrics.lowContrast)}`,
  )
  check(
    !metrics.lowBoundaries.length,
    `${size}/${label}: low control boundary contrast: ${JSON.stringify(metrics.lowBoundaries)}`,
  )
  if (size === 'zoom-200')
    check(
      metrics.dpr === 2 && metrics.width <= metrics.outerWidth / 2,
      'Actual 200% browser zoom expected',
    )
  if (size === 'zoom-200') {
    // Playwright's CSS-pixel full-page clip crops screenshots at browser page zoom.
    // CDP's device-pixel contentSize captures the complete zoomed document.
    const cdp = await page.context().newCDPSession(page)
    const { contentSize } = await cdp.send('Page.getLayoutMetrics')
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { ...contentSize, scale: 1 },
    })
    await writeFile(`${output}${size}-${label}.png`, Buffer.from(data, 'base64'))
    await cdp.detach()
  } else await page.screenshot({ path: `${output}${size}-${label}.png`, fullPage: true })
  results.push({ size, state: label, ...metrics })
}

async function fixture(context, options = {}) {
  const state = { user: admin, meals: [meal, longMeal], ...options }
  const page = await context.newPage()
  page.on('pageerror', (error) => failures.push(error.message))
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    let status = 200,
      data = {}
    if (path.endsWith('/auth/me')) {
      data = state.user
      if (!data) status = 401
    } else if (path.endsWith('/auth/csrf')) data = { token: 'local-review-csrf' }
    else if (path.endsWith('/auth/logout')) {
      status = 204
      state.user = null
    } else if (path.endsWith('/auth/login')) data = member
    else if (path.endsWith('/auth/change-password')) data = member
    else if (path.endsWith('/admin/users')) {
      if (method === 'POST') {
        if (state.pendingAccount) await state.pendingAccount
        status = state.accountFailure ? 500 : 201
        data = {
          ...member,
          ...route.request().postDataJSON(),
          id: 'created',
          temporaryPassword: 'ReviewOnly-Temporary-Password-123456',
        }
      } else {
        if (state.pendingUsers) await state.pendingUsers
        status = state.usersFailure ? 500 : 200
        data = users
      }
    } else if (path.includes('/dishes')) {
      if (method === 'POST' || method === 'PUT') {
        if (state.pendingSave) await state.pendingSave
        status = state.saveFailure ? 500 : 200
        data = { ...meal, ...route.request().postDataJSON() }
      } else {
        if (state.pendingMeals) await state.pendingMeals
        status = state.listFailure ? 500 : 200
        data = state.meals
      }
    } else throw new Error(`Unmocked API: ${method} ${path}`)
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: status === 204 ? undefined : JSON.stringify(data),
    })
  })
  await page.goto(base)
  return { page, state }
}
async function accountView(page) {
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByRole('button', { name: 'Family accounts' }).click()
}
async function focused(page, name) {
  check(
    await page.evaluate((name) => document.activeElement?.textContent?.trim() === name, name),
    `Expected focus on ${name}`,
  )
}

try {
  for (const width of [360, 768, 1280, 640]) {
    const size = width === 640 ? 'zoom-200' : String(width)
    const context =
      width === 640
        ? await chromium.launchPersistentContext(
            fileURLToPath(
              new URL('../../../frontend/node_modules/.cache/review-zoom/', import.meta.url),
            ),
            {
              channel: 'chrome',
              headless: true,
              viewport: null,
              args: ['--window-size=1280,1000'],
            },
          )
        : await browser.newContext({ viewport: { width, height: 900 } })
    if (width === 640) {
      const settings = context.pages()[0]
      await settings.goto('chrome://settings/appearance')
      await settings.locator('#zoomLevel').selectOption('2')
      await settings.close()
    }
    let { page } = await fixture(context, { user: null })
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor()
    await capture(page, 'login', size)
    await page.keyboard.press('Tab')
    check(
      await page.getByLabel('Email').evaluate((el) => el === document.activeElement),
      `${size}: login keyboard starts at Email`,
    )
    await capture(page, 'login-focus', size)
    await page.close()

    ;({ page } = await fixture(context, { user: { ...admin, mustChangePassword: true } }))
    await page.getByRole('button', { name: 'Save new password' }).waitFor()
    await capture(page, 'password-change', size)
    await page.close()

    let releaseMeals
    ;({ page } = await fixture(context, {
      user: member,
      meals: [],
      pendingMeals: new Promise((resolve) => {
        releaseMeals = resolve
      }),
    }))
    await page.getByText('Loading meals…').waitFor()
    await capture(page, 'journal-loading', size)
    releaseMeals()
    await page.getByText('No meals yet. Record your first meal.').waitFor()
    await capture(page, 'journal-empty-member', size)
    await page.close()

    let state
    ;({ page, state } = await fixture(context))
    await page.getByRole('button', { name: meal.name, exact: true }).waitFor()
    await capture(page, 'journal-populated', size)
    await page.getByRole('button', { name: 'Journal', exact: true }).hover()
    await capture(page, 'journal-selected-hover', size)
    await page.getByRole('button', { name: 'Add meal', exact: true }).hover()
    await capture(page, 'primary-hover', size)
    await page.getByRole('button', { name: 'Account', exact: true }).hover()
    await capture(page, 'secondary-hover', size)
    await page.getByRole('button', { name: longMeal.name, exact: true }).click()
    await focused(page, longMeal.name)
    await capture(page, 'long-meal-detail', size)
    await page.getByRole('button', { name: 'Edit meal', exact: true }).click()
    await capture(page, 'edit-meal', size)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await focused(page, 'Edit meal')
    await page.getByRole('button', { name: 'Back to meals' }).click()
    await focused(page, longMeal.name)
    await page.getByRole('button', { name: 'Add meal', exact: true }).click()
    await page.getByLabel('Meal name').fill('A draft meal for the family')
    await page.getByLabel('Location (optional)').fill('Home')
    await capture(page, 'create-meal', size)
    state.saveFailure = true
    await page.getByRole('button', { name: 'Save meal', exact: true }).click()
    await page.getByRole('alert').waitFor()
    await capture(page, 'failed-save', size)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await focused(page, 'Keep editing')
    await capture(page, 'discard-focus', size)
    await page.keyboard.press('Escape')
    await focused(page, 'Cancel')
    await page.getByRole('button', { name: 'Account', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await focused(page, 'Family accounts')
    await capture(page, 'account-disclosure', size)
    await page.keyboard.press('Escape')
    await focused(page, 'Account')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await focused(page, 'Family accounts')
    await page.keyboard.press('Tab')
    await page.keyboard.type('new.member@example.com')
    await page.keyboard.press('Tab')
    await page.keyboard.press('ArrowDown')
    await capture(page, 'account-draft', size)
    await page.getByRole('button', { name: 'Journal', exact: true }).hover()
    await capture(page, 'journal-inactive-hover', size)
    check(
      (await page.getByLabel('Role').inputValue()) === 'ADMIN',
      `${size}: keyboard role selection`,
    )
    await page.getByRole('button', { name: 'Journal', exact: true }).click()
    check(
      (await page.getByLabel('Meal name').inputValue()) === 'A draft meal for the family',
      `${size}: meal draft preserved`,
    )
    await accountView(page)
    check(
      (await page.getByLabel('Email').inputValue()) === 'new.member@example.com',
      `${size}: account draft preserved`,
    )
    let releaseAccount
    state.pendingAccount = new Promise((resolve) => {
      releaseAccount = resolve
    })
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await page.getByRole('button', { name: 'Creating…' }).waitFor()
    await capture(page, 'account-pending', size)
    releaseAccount()
    await page.getByText('ReviewOnly-Temporary-Password-123456').waitFor()
    await capture(page, 'temporary-password', size)
    await page.close()

    let releaseUsers
    ;({ page } = await fixture(context, {
      pendingUsers: new Promise((resolve) => {
        releaseUsers = resolve
      }),
      usersFailure: true,
    }))
    await accountView(page)
    await page.getByText('Loading family accounts…').waitFor()
    await capture(page, 'accounts-loading', size)
    releaseUsers()
    await page.getByRole('alert').waitFor()
    await capture(page, 'accounts-failure', size)
    await page.close()

    // Complete a member flow using only keyboard input after initial navigation.
    ;({ page } = await fixture(context, { user: null }))
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor()
    await page.keyboard.press('Tab')
    await page.keyboard.type('member@example.com')
    await page.keyboard.press('Tab')
    await page.keyboard.type('local-review-password')
    await page.keyboard.press('Enter')
    await page.getByRole('heading', { name: 'Meal journal' }).waitFor()
    await page.keyboard.press('Tab')
    await focused(page, 'Add meal')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.type('Keyboard supper')
    // Native date controls can have multiple Tab stops; traverse by semantic target.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab')
      if (
        await page
          .getByRole('button', { name: 'Save meal', exact: true })
          .evaluate((el) => el === document.activeElement)
      )
        break
    }
    await focused(page, 'Save meal')
    await page.keyboard.press('Enter')
    await page.getByRole('heading', { name: 'Keyboard supper' }).waitFor()
    await focused(page, 'Keyboard supper')
    await capture(page, 'keyboard-saved', size)
    await page.keyboard.press('Tab')
    await focused(page, 'Edit meal')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('Changed keyboard supper')
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab')
      if (
        await page
          .getByRole('button', { name: 'Cancel', exact: true })
          .evaluate((el) => el === document.activeElement)
      )
        break
    }
    await page.keyboard.press('Enter')
    await focused(page, 'Keep editing')
    await page.keyboard.press('Tab')
    await focused(page, 'Discard changes')
    await page.keyboard.press('Enter')
    await focused(page, 'Edit meal')
    await page.keyboard.press('Shift+Tab')
    await focused(page, 'Back to meals')
    await page.keyboard.press('Enter')
    await focused(page, 'Keyboard supper')
    await page.close()
    await context.close()
  }
} finally {
  await browser.close()
  await writeFile(
    new URL('./results.json', import.meta.url),
    JSON.stringify(
      {
        browser: version,
        zoomNote:
          'Actual Chrome page zoom set to 200% through chrome://settings/appearance in an isolated temporary profile, outer window 1280px. DPR and CSS viewport recorded per capture.',
        results,
        failures,
      },
      null,
      2,
    ) + '\n',
  )
}
console.log(JSON.stringify({ browser: version, captures: results.length, failures }, null, 2))
assert.equal(failures.length, 0, 'Review findings need correction; see results.json')
