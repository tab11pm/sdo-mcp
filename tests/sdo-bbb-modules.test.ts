import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import {
	extractBbbModules,
	hasAuthenticatedSdoSession,
	listBbbCourseModules,
} from '../src/sdo.js'

interface AnchorFixture {
	name: string
	href: string
}

function readModuleFixture(): AnchorFixture[] {
	const html = readFileSync(
		new URL('./fixtures/course-modules.html', import.meta.url),
		'utf8',
	)

	return [...html.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/gu)].map(
		([, href, name]) => ({ name: name!, href: href! }),
	)
}

function sessionPage(url: string, loginFormCount = 0) {
	return {
		goto: vi.fn().mockResolvedValue(undefined),
		url: vi.fn().mockReturnValue(url),
		locator: vi.fn().mockReturnValue({
			count: vi.fn().mockResolvedValue(loginFormCount),
		}),
	}
}

describe('hasAuthenticatedSdoSession', () => {
	it('rejects an SDO login route', async () => {
		const page = sessionPage('https://sdo.tusur.ru/login/index.php')

		await expect(hasAuthenticatedSdoSession(page as never)).resolves.toBe(false)
	})

	it('rejects a page containing a login form', async () => {
		const page = sessionPage('https://sdo.tusur.ru/', 1)

		await expect(hasAuthenticatedSdoSession(page as never)).resolves.toBe(false)
	})

	it('accepts an SDO page without a login route or form', async () => {
		const page = sessionPage('https://sdo.tusur.ru/my/')

		await expect(hasAuthenticatedSdoSession(page as never)).resolves.toBe(true)
	})
})

describe('extractBbbModules', () => {
	it('keeps one stable BBB activity and excludes duplicates and non-BBB links', () => {
		const fixtureAnchors = readModuleFixture()
		const anchors: AnchorFixture[] = [
			...fixtureAnchors,
			{
				name: 'Лекция 1 — дубликат',
				href: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=17',
			},
			{
				name: 'Задание',
				href: 'https://sdo.tusur.ru/mod/assign/view.php?id=20',
			},
		]

		expect(extractBbbModules(anchors)).toEqual([
			{
				name: 'Лекция 1',
				activityUrl:
					'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=17',
			},
		])
	})
})

describe('listBbbCourseModules', () => {
	it('reads course anchors and returns only de-duplicated stable BBB modules', async () => {
		const anchors = readModuleFixture().map(({ name, href }) => ({
			textContent: `  ${name}  `,
			href,
		}))
		anchors.push({
			textContent: 'Duplicate',
			href: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=17',
		})
		const evaluateAll = vi
			.fn()
			.mockImplementation(async (readAnchors) => readAnchors(anchors))
		const page = {
			goto: vi.fn().mockResolvedValue(undefined),
			locator: vi.fn().mockReturnValue({ evaluateAll }),
		}

		await expect(
			listBbbCourseModules(
				page as never,
				'https://sdo.tusur.ru/course/view.php?id=20',
			),
		).resolves.toEqual([
			{
				name: 'Лекция 1',
				activityUrl:
					'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=17',
			},
		])
	})
})
