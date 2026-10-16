import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
	validateCourseUrl,
	validateAssignmentUrl,
	validateModuleUrl,
	filterCourseModules,
	filterFileLinks,
	listCourseModules,
	downloadSdoModuleFiles,
} from '../src/course-tools.js'

describe('course tool boundaries', () => {
	it.each([
		'https://example.com/course/view.php?id=2',
		'https://sdo.tusur.ru.evil.test/course/view.php?id=2',
		'http://sdo.tusur.ru/course/view.php?id=2',
		'https://user:secret@sdo.tusur.ru/course/view.php?id=2',
		'https://sdo.tusur.ru/course/view.php?id=2&token=secret',
		'https://sdo.tusur.ru/course/view.php?id=2#fragment',
	])('rejects unsafe course input: %s', (url) => {
		expect(() => validateCourseUrl(url)).toThrow()
	})

	it('allows only specific SDO assignment and downloadable module pages', () => {
		expect(validateAssignmentUrl('https://sdo.tusur.ru/mod/assign/view.php?id=3'))
			.toBe('https://sdo.tusur.ru/mod/assign/view.php?id=3')
		expect(validateModuleUrl('https://sdo.tusur.ru/mod/resource/view.php?id=4').type)
			.toBe('resource')
		expect(() => validateModuleUrl('https://sdo.tusur.ru/course/view.php?id=4'))
			.toThrow()
		expect(() => validateAssignmentUrl('https://sdo.tusur.ru/mod/quiz/view.php?id=3'))
			.toThrow()
	})

	it('returns only canonical SDO module links from a course', () => {
		expect(filterCourseModules([
		{ title: 'Задание', url: 'https://sdo.tusur.ru/mod/assign/view.php?id=3' },
		{ title: 'Подмена', url: 'https://evil.test/mod/assign/view.php?id=3' },
		{ title: 'Токен', url: 'https://sdo.tusur.ru/mod/assign/view.php?id=3&token=abc' },
		{ title: 'Задание дубль', url: 'https://sdo.tusur.ru/mod/assign/view.php?id=3' },
	])).toEqual([{ title: 'Задание', url: 'https://sdo.tusur.ru/mod/assign/view.php?id=3', type: 'assign' }])
	})

	it('keeps only same-origin pluginfile links and limits their count', () => {
		const links = [
			{ text: 'A', href: 'https://sdo.tusur.ru/pluginfile.php/1/a.pdf' },
			{ text: 'B', href: 'https://evil.test/pluginfile.php/1/b.pdf' },
			{ text: 'C', href: 'https://sdo.tusur.ru/course/view.php?id=1' },
			{ text: 'D', href: 'https://sdo.tusur.ru/pluginfile.php/1/a.pdf' },
		]
		expect(filterFileLinks(links)).toEqual([links[0]])
	})

	it('rejects an unsafe course URL before any browser request', async () => {
		const page = { route: vi.fn(), goto: vi.fn() }
		await expect(listCourseModules(page as never, 'https://evil.test/course/view.php?id=2'))
			.rejects.toThrow('Invalid SDO course URL')
		expect(page.route).not.toHaveBeenCalled()
		expect(page.goto).not.toHaveBeenCalled()
	})

	it('refuses a redirected page before reading course links', async () => {
		const page = {
			route: vi.fn().mockResolvedValue(undefined),
			goto: vi.fn().mockResolvedValue({ ok: () => true }),
			url: vi.fn().mockReturnValue('https://evil.test/private'),
			locator: vi.fn(),
		}
		await expect(listCourseModules(page as never, 'https://sdo.tusur.ru/course/view.php?id=2'))
			.rejects.toThrow('SDO navigation left the validated page')
		expect(page.locator).not.toHaveBeenCalled()
	})

	it('blocks requests to other origins while opening a course', async () => {
		let handler: ((route: { request: () => { url: () => string }; continue: () => Promise<void>; abort: () => Promise<void> }) => Promise<void>) | undefined
		const page = {
			route: vi.fn().mockImplementation(async (_pattern, callback) => { handler = callback }),
			goto: vi.fn().mockResolvedValue({ ok: () => true }),
			url: vi.fn().mockReturnValue('https://sdo.tusur.ru/course/view.php?id=2'),
			locator: vi.fn().mockImplementation((selector: string) => selector === 'a[href]'
				? { evaluateAll: vi.fn().mockResolvedValue([]) }
				: { count: vi.fn().mockResolvedValue(selector.includes('logout.php') ? 1 : 0) }),
		}
		await listCourseModules(page as never, 'https://sdo.tusur.ru/course/view.php?id=2')
		const abort = vi.fn().mockResolvedValue(undefined)
		const next = vi.fn().mockResolvedValue(undefined)
		await handler!({ request: () => ({ url: () => 'https://127.0.0.1/private' }), abort, continue: next })
		expect(abort).toHaveBeenCalledOnce()
		expect(next).not.toHaveBeenCalled()
	})

	it('does not follow a file redirect while downloading an assignment', async () => {
		const requestGet = vi.fn().mockResolvedValue({ ok: () => false, headers: () => ({ location: 'https://evil.test/file' }) })
		const page = {
			route: vi.fn().mockResolvedValue(undefined),
			goto: vi.fn().mockResolvedValue({ ok: () => true }),
			url: vi.fn().mockReturnValue('https://sdo.tusur.ru/mod/assign/view.php?id=3'),
			locator: vi.fn().mockImplementation((selector: string) => {
				if (selector === 'a[href]') return { evaluateAll: vi.fn().mockImplementation(async (read) => read([
					{ textContent: 'file', href: 'https://sdo.tusur.ru/pluginfile.php/3/file.pdf' },
				])) }
				if (selector === 'h1, h2, .page-header-headings') return { first: () => ({ innerText: vi.fn().mockResolvedValue('Task') }) }
				if (selector === 'body') return { innerText: vi.fn().mockResolvedValue('Task text') }
				return { count: vi.fn().mockResolvedValue(selector.includes('logout.php') ? 1 : 0) }
			}),
			context: () => ({ request: { get: requestGet } }),
		}
		const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sdo-course-test-'))
		try {
			const result = await downloadSdoModuleFiles(page as never, 'https://sdo.tusur.ru/mod/assign/view.php?id=3', outputRoot)
			expect(requestGet).toHaveBeenCalledWith('https://sdo.tusur.ru/pluginfile.php/3/file.pdf',
				{ timeout: 30000, maxRedirects: 0 })
			expect(result.files[0]?.status).toBe('skipped')
		} finally {
			await fs.rm(outputRoot, { recursive: true, force: true })
		}
	})

	it('keeps direct resource downloads inside the module directory', async () => {
		const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sdo-direct-test-'))
		const sourcePath = path.join(outputRoot, 'source')
		await fs.writeFile(sourcePath, 'file')
		const saveAs = vi.fn().mockResolvedValue(undefined)
		const page = {
			route: vi.fn().mockResolvedValue(undefined),
			goto: vi.fn().mockResolvedValue(undefined),
			url: vi.fn().mockReturnValue('https://sdo.tusur.ru/mod/resource/view.php?id=4'),
			locator: vi.fn().mockImplementation((selector: string) => ({
				count: vi.fn().mockResolvedValue(selector.includes('logout.php') ? 1 : 0),
			})),
			waitForEvent: vi.fn().mockResolvedValue({
				url: () => 'https://sdo.tusur.ru/pluginfile.php/4/file.pdf',
				path: async () => sourcePath,
				suggestedFilename: () => '..',
				saveAs,
			}),
		}
		try {
			const result = await downloadSdoModuleFiles(page as never, 'https://sdo.tusur.ru/mod/resource/view.php?id=4', outputRoot)
			expect(result.files[0]?.status).toBe('downloaded')
			expect(saveAs).toHaveBeenCalledWith(path.join(outputRoot, 'resource-4', 'file'))
		} finally {
			await fs.rm(outputRoot, { recursive: true, force: true })
		}
	})
})
