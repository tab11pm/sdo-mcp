import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright'

import { resolveOnlineLecture } from '../src/resolve-online-lecture.js'
import { hasAuthenticatedSdoSession } from '../src/sdo.js'

const rootUrl = 'https://sdo.tusur.ru/'
const loginUrl = 'https://sdo.tusur.ru/login/index.php'
const courseUrl = 'https://sdo.tusur.ru/course/view.php?id=20'
const maintenanceUrl = 'https://sdo.tusur.ru/maintenance/'

const authenticatedHtml = `<!doctype html>
<html><body><a href="/login/logout.php?sesskey=fixture">Log out</a></body></html>`
const loginHtml = `<!doctype html>
<html><body><p>You are not logged in.</p><a href="/login/index.php">Log in</a></body></html>`

async function interceptedPage(
	browser: Browser,
	respond: (url: string, route: Route) => Promise<void>,
): Promise<{ context: BrowserContext; page: Page }> {
	const context = await browser.newContext()
	const page = await context.newPage()
	await page.route('**/*', async (route) => {
		await respond(route.request().url(), route)
	})
	return { context, page }
}

describe('real Playwright authentication boundaries', () => {
	let browser: Browser

	beforeAll(async () => {
		browser = await chromium.launch({ headless: true })
	})

	afterAll(async () => {
		await browser.close()
	})

	it('rejects a guest root with an ordinary Log in link', async () => {
		const { context, page } = await interceptedPage(
			browser,
			async (_url, route) => {
				await route.fulfill({ contentType: 'text/html', body: loginHtml })
			},
		)

		try {
			await expect(hasAuthenticatedSdoSession(page)).resolves.toBe(false)
		} finally {
			await context.close()
		}
	})

	it('rejects an HTTP 503 root as unavailable instead of authenticated', async () => {
		const { context, page } = await interceptedPage(
			browser,
			async (_url, route) => {
				await route.fulfill({
					status: 503,
					contentType: 'text/html',
					body: '<h1>Service unavailable</h1>',
				})
			},
		)

		try {
			await expect(hasAuthenticatedSdoSession(page)).rejects.toThrow(
				'SDO page unavailable',
			)
		} finally {
			await context.close()
		}
	})

	it('returns auth_required when query discovery redirects to login', async () => {
		let rootRequests = 0
		const { context, page } = await interceptedPage(
			browser,
			async (url, route) => {
				if (url === rootUrl) {
					rootRequests += 1
					if (rootRequests === 1) {
						await route.fulfill({
							contentType: 'text/html',
							body: authenticatedHtml,
						})
						return
					}
					await route.fulfill({ status: 302, headers: { location: loginUrl } })
					return
				}
				await route.fulfill({ contentType: 'text/html', body: loginHtml })
			},
		)

		try {
			await expect(
				resolveOnlineLecture(page, { courseQuery: 'physics' }),
			).resolves.toEqual({ status: 'auth_required' })
		} finally {
			await context.close()
		}
	})

	it('returns auth_required when direct course discovery redirects to login', async () => {
		const { context, page } = await interceptedPage(
			browser,
			async (url, route) => {
				if (url === rootUrl) {
					await route.fulfill({
						contentType: 'text/html',
						body: authenticatedHtml,
					})
					return
				}
				if (url === courseUrl) {
					await route.fulfill({ status: 302, headers: { location: loginUrl } })
					return
				}
				await route.fulfill({ contentType: 'text/html', body: loginHtml })
			},
		)

		try {
			await expect(
				resolveOnlineLecture(page, { courseUrl }),
			).resolves.toEqual({ status: 'auth_required' })
		} finally {
			await context.close()
		}
	})

	it('returns auth_required for markerless guest HTML at the course URL', async () => {
		const { context, page } = await interceptedPage(
			browser,
			async (url, route) => {
				if (url === rootUrl) {
					await route.fulfill({
						contentType: 'text/html',
						body: authenticatedHtml,
					})
					return
				}
				await route.fulfill({
					contentType: 'text/html',
					body: '<p>You are not logged in.</p>',
				})
			},
		)

		try {
			await expect(
				resolveOnlineLecture(page, { courseUrl }),
			).resolves.toEqual({ status: 'auth_required' })
		} finally {
			await context.close()
		}
	})

	it('rejects an unexpected same-origin redirect during the initial root probe', async () => {
		const { context, page } = await interceptedPage(
			browser,
			async (url, route) => {
				if (url === rootUrl) {
					await route.fulfill({
						status: 302,
						headers: { location: maintenanceUrl },
					})
					return
				}
				await route.fulfill({
					contentType: 'text/html',
					body: '<h1>Maintenance</h1>',
				})
			},
		)

		try {
			await expect(
				resolveOnlineLecture(page, { courseUrl }),
			).rejects.toThrow('SDO page unavailable')
		} finally {
			await context.close()
		}
	})

	it('rejects an unexpected same-origin redirect during query discovery', async () => {
		let rootRequests = 0
		const { context, page } = await interceptedPage(
			browser,
			async (url, route) => {
				if (url === rootUrl) {
					rootRequests += 1
					if (rootRequests === 1) {
						await route.fulfill({
							contentType: 'text/html',
							body: authenticatedHtml,
						})
						return
					}
					await route.fulfill({
						status: 302,
						headers: { location: maintenanceUrl },
					})
					return
				}
				await route.fulfill({
					contentType: 'text/html',
					body: '<h1>Maintenance</h1>',
				})
			},
		)

		try {
			await expect(
				resolveOnlineLecture(page, { courseQuery: 'physics' }),
			).rejects.toThrow('SDO page unavailable')
		} finally {
			await context.close()
		}
	})
})
