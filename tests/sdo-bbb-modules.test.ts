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

function sessionPage(
	url: string,
	options: {
		loginFormCount?: number
		loginButtonCount?: number
		authenticatedMarkerCount?: number
		responseOk?: boolean
	} = {},
) {
	return {
		goto: vi.fn().mockResolvedValue(
			options.responseOk === undefined
				? undefined
				: { ok: () => options.responseOk },
		),
		url: vi.fn().mockReturnValue(url),
		locator: vi.fn().mockImplementation((selector: string) => ({
			count: vi.fn().mockResolvedValue(
				selector.includes('logout.php') || selector.includes('.usermenu')
					? (options.authenticatedMarkerCount ?? 0)
					: selector.includes('Вход через кабинет') ||
							selector.includes('Log in')
					? (options.loginButtonCount ?? 0)
					: (options.loginFormCount ?? 0),
			),
		})),
	}
}

describe('hasAuthenticatedSdoSession', () => {
	it('rejects an SDO login route', async () => {
		const page = sessionPage('https://sdo.tusur.ru/login/index.php')

		await expect(hasAuthenticatedSdoSession(page as never)).resolves.toBe(false)
	})

	it('rejects a page containing a login form', async () => {
		const page = sessionPage('https://sdo.tusur.ru/', { loginFormCount: 1 })

		await expect(hasAuthenticatedSdoSession(page as never)).resolves.toBe(false)
	})

	it('rejects the public root containing the TUSUR cabinet login control', async () => {
		const page = sessionPage('https://sdo.tusur.ru/', {
			loginButtonCount: 1,
		})

		await expect(hasAuthenticatedSdoSession(page as never)).resolves.toBe(false)
	})

	it('rejects an expired profile-login destination', async () => {
		const page = sessionPage('https://profile.tusur.ru/en/users/sign_in')

		await expect(hasAuthenticatedSdoSession(page as never)).resolves.toBe(false)
	})

	it.each([
		'https://sdo.tusur.ru:444/my/',
		'https://user:secret@sdo.tusur.ru/my/',
	])('rejects a non-canonical session destination as unavailable: %s', async (url) => {
		const page = sessionPage(url)

		await expect(hasAuthenticatedSdoSession(page as never)).rejects.toThrow(
			'SDO page unavailable',
		)
	})

	it('accepts an SDO page with a positive authenticated-session marker', async () => {
		const page = sessionPage('https://sdo.tusur.ru/my/', {
			authenticatedMarkerCount: 1,
		})

		await expect(hasAuthenticatedSdoSession(page as never)).resolves.toBe(true)
	})

	it('rejects an unexpected same-origin document as unavailable', async () => {
		const page = sessionPage('https://sdo.tusur.ru/maintenance/', {
			responseOk: true,
		})

		await expect(hasAuthenticatedSdoSession(page as never)).rejects.toThrow(
			'SDO page unavailable',
		)
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
	it.each([
		'https://example.invalid/course/view.php?id=20',
		'https://127.0.0.1/course/view.php?id=20',
		'https://sdo.tusur.ru/mod/resource/view.php?id=20',
		'https://sdo.tusur.ru/mod/assign/view.php?id=20',
		'https://user:secret@sdo.tusur.ru/course/view.php?id=20',
		'https://sdo.tusur.ru/course/view.php?id=20&token=secret',
		'https://sdo.tusur.ru/course/view.php?id=20&redirect=https%3A%2F%2Fexample.invalid',
	])('rejects an unsafe course URL before navigation: %s', async (courseUrl) => {
		const page = {
			goto: vi.fn(),
			url: vi.fn(),
			locator: vi.fn(),
		}

		await expect(
			listBbbCourseModules(page as never, courseUrl),
		).rejects.toThrow('Invalid SDO course URL')
		expect(page.goto).not.toHaveBeenCalled()
	})

	it.each([
		'https://example.invalid/course/view.php?id=20',
		'https://127.0.0.1/private',
	])('rejects an unsafe redirect before reading anchors: %s', async (redirectUrl) => {
		const page = {
			goto: vi.fn().mockResolvedValue(undefined),
			url: vi.fn().mockReturnValue(redirectUrl),
			locator: vi.fn(),
		}

		await expect(
			listBbbCourseModules(
				page as never,
				'https://sdo.tusur.ru/course/view.php?id=20',
			),
		).rejects.toThrow('SDO course navigation left the validated course page')
		expect(page.locator).not.toHaveBeenCalled()
	})

	it('reports a course redirect to login as authentication required', async () => {
		const page = {
			goto: vi.fn().mockResolvedValue(undefined),
			url: vi
				.fn()
				.mockReturnValue('https://sdo.tusur.ru/login/index.php'),
			locator: vi.fn(),
		}

		await expect(
			listBbbCourseModules(
				page as never,
				'https://sdo.tusur.ru/course/view.php?id=20',
			),
		).rejects.toThrow('SDO authentication required')
		expect(page.locator).not.toHaveBeenCalled()
	})

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
			url: vi
				.fn()
				.mockReturnValue('https://sdo.tusur.ru/course/view.php?id=20'),
			locator: vi.fn().mockImplementation((selector: string) =>
				selector === 'a[href]'
					? { evaluateAll }
					: {
							count: vi
								.fn()
								.mockResolvedValue(selector.includes('logout.php') ? 1 : 0),
						},
			),
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
