import fs from 'node:fs/promises'
import path from 'node:path'
import type { Download, Page } from 'playwright'

import { isSdoCourseUrl, normalizeSearchText } from './lecture-resolution.js'
import { listAuthenticatedCourses } from './sdo.js'
import { SdoAuthenticationRequiredError, SdoPageUnavailableError } from './sdo-session-errors.js'

const ORIGIN = 'https://sdo.tusur.ru'
const MAX_FILES = 20
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_BYTES = 100 * 1024 * 1024
const DIRECT_FILE_EXTENSION = /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|jpe?g|png)$/iu
const NON_FILE_ROUTE = /^\/(?:admin|calendar|course|grade|login|mod|user|webservice)(?:\/|$)/iu

type ModuleType = 'resource' | 'assign' | 'forum' | 'quiz'
type Link = { title: string; url: string }
type FileLink = { text: string; href: string }

function canonicalPageUrl(value: string, pathname: string): string | undefined {
	try {
		const url = new URL(value)
		const ids = url.searchParams.getAll('id')
		if (url.origin !== ORIGIN || url.username || url.password || url.pathname !== pathname ||
			url.hash || [...url.searchParams.keys()].length !== 1 || ids.length !== 1 ||
			!/^[1-9]\d*$/u.test(ids[0] ?? '')) return undefined
		return `${ORIGIN}${pathname}?id=${ids[0]}`
	} catch {
		return undefined
	}
}

export function validateCourseUrl(value: string): string {
	if (!isSdoCourseUrl(value)) throw new Error('Invalid SDO course URL')
	return canonicalPageUrl(value, '/course/view.php')!
}

export function validateAssignmentUrl(value: string): string {
	const url = canonicalPageUrl(value, '/mod/assign/view.php')
	if (!url) throw new Error('Invalid SDO assignment URL')
	return url
}

export function validateModuleUrl(value: string): { url: string; type: 'resource' | 'assign'; id: string } {
	for (const type of ['resource', 'assign'] as const) {
		const url = canonicalPageUrl(value, `/mod/${type}/view.php`)
		if (url) return { url, type, id: new URL(url).searchParams.get('id')! }
	}
	throw new Error('Expected one SDO resource or assignment URL')
}

export function filterCourseModules(links: readonly Link[]): Array<Link & { type: ModuleType }> {
	const modules = new Map<string, Link & { type: ModuleType }>()
	for (const link of links) {
		for (const type of ['resource', 'assign', 'forum', 'quiz'] as const) {
			const url = canonicalPageUrl(link.url, `/mod/${type}/view.php`)
			const title = link.title.replace(/\s+/gu, ' ').trim()
			if (url && title && !modules.has(url)) modules.set(url, { title, url, type })
		}
	}
	return [...modules.values()]
}

function canonicalFileUrl(value: string): string | undefined {
	try {
		const url = new URL(value)
		const pluginFile = /^\/(?:webservice\/)?pluginfile\.php\/[^/]/u.test(url.pathname)
		const directFile = DIRECT_FILE_EXTENSION.test(url.pathname) && !NON_FILE_ROUTE.test(url.pathname)
		if (url.origin !== ORIGIN || url.username || url.password || url.hash ||
			(!pluginFile && !directFile) ||
			(url.search !== '' && (!pluginFile || url.search !== '?forcedownload=1'))) return undefined
		return url.href
	} catch {
		return undefined
	}
}

async function guardSdoRequests(page: Page): Promise<void> {
	await page.route('**/*', async (route) => {
		try {
			if (new URL(route.request().url()).origin === ORIGIN) {
				await route.continue()
				return
			}
		} catch { /* Reject malformed URLs. */ }
		await route.abort()
	})
}

export function filterFileLinks(links: readonly FileLink[]): FileLink[] {
	const files = new Map<string, FileLink>()
	for (const link of links) {
		const href = canonicalFileUrl(link.href)
		if (href && !files.has(href) && files.size < MAX_FILES) files.set(href, { text: link.text, href })
	}
	return [...files.values()]
}

async function openAuthenticatedPage(page: Page, url: string): Promise<void> {
	await guardSdoRequests(page)
	const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
	if (response !== null && response !== undefined && !response.ok()) throw new SdoPageUnavailableError()
	const finalUrl = page.url()
	if (/^https:\/\/(?:sdo|profile)\.tusur\.ru\/(?:login|.*sign_in)/u.test(finalUrl)) {
		throw new SdoAuthenticationRequiredError()
	}
	if (finalUrl !== url) throw new Error('SDO navigation left the validated page')
	if ((await page.locator('form:has(input[type="password"]), #login').count()) > 0) {
		throw new SdoAuthenticationRequiredError()
	}
	if ((await page.locator('a[href*="/login/logout.php"]').count()) === 0) {
		throw new SdoAuthenticationRequiredError()
	}
}

async function readLinks(page: Page): Promise<Link[]> {
	return page.locator('a[href]').evaluateAll((anchors) => anchors.map((a) => ({
		title: a.textContent ?? '', url: (a as HTMLAnchorElement).href,
	})))
}

export async function listCourses(page: Page): Promise<Link[]> {
	await guardSdoRequests(page)
	const courses = await listAuthenticatedCourses(page)
	const unique = new Map<string, Link>()
	for (const course of courses) {
		const url = canonicalPageUrl(course.url, '/course/view.php')
		const title = course.title.replace(/\s+/gu, ' ').trim()
		if (url && title && !unique.has(url)) unique.set(url, { title, url })
	}
	return [...unique.values()]
}

export async function listCourseModules(page: Page, courseUrl: string) {
	const url = validateCourseUrl(courseUrl)
	await openAuthenticatedPage(page, url)
	return { courseUrl: url, modules: filterCourseModules(await readLinks(page)) }
}

export async function findCourseModule(page: Page, courseUrl: string, query: string) {
	const normalizedQuery = normalizeSearchText(query)
	if (!normalizedQuery) throw new Error('Module query must not be empty')
	const result = await listCourseModules(page, courseUrl)
	const matches = result.modules.map((module) => {
		const title = normalizeSearchText(module.title)
		const score = title === normalizedQuery ? 100 : title.includes(normalizedQuery) ? 50 :
			normalizedQuery.split(' ').filter((word) => word.length > 1 && title.includes(word)).length
		return { ...module, score }
	}).filter((module) => module.score > 0).sort((a, b) => b.score - a.score)
	return { courseUrl: result.courseUrl, query, totalModules: result.modules.length, matches }
}

export async function getAssignmentDetails(page: Page, assignmentUrl: string): Promise<string> {
	await openAuthenticatedPage(page, validateAssignmentUrl(assignmentUrl))
	return page.locator('body').innerText()
}

function safeFileName(value: string): string {
	const name = value.replace(/[<>:"/\\|?*\x00-\x1F]/gu, '_').replace(/\s+/gu, ' ').trim().slice(0, 180)
	return name && name !== '.' && name !== '..' ? name : 'file'
}

function responseFileName(contentDisposition: string | undefined, fallback: string): string {
	if (contentDisposition) {
		const encoded = contentDisposition.match(/(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]+)/iu)?.[1]
		if (encoded) {
			try { return safeFileName(decodeURIComponent(encoded.trim())) } catch { /* Use fallback. */ }
		}
		const quoted = contentDisposition.match(/(?:^|;)\s*filename\s*=\s*"([^"]*)"/iu)?.[1]
		const plain = contentDisposition.match(/(?:^|;)\s*filename\s*=\s*([^;]+)/iu)?.[1]
		const name = quoted ?? plain?.trim()
		if (name) return safeFileName(name)
	}
	return fallback
}

export async function downloadSdoModuleFiles(page: Page, moduleUrl: string, outputRoot = 'downloads') {
	const module = validateModuleUrl(moduleUrl)
	let directDownload: Download | undefined
	if (module.type === 'resource') {
		const event = page.waitForEvent('download', { timeout: 5000 }).catch(() => undefined)
		let navigationError: unknown
		try { await openAuthenticatedPage(page, module.url) } catch (error) { navigationError = error }
		directDownload = await event
		if (!directDownload && navigationError) throw navigationError
	} else {
		await openAuthenticatedPage(page, module.url)
	}
	if (directDownload) {
		if (!canonicalFileUrl(directDownload.url())) throw new Error('Unsafe SDO download URL')
		const sourcePath = await directDownload.path()
		if (!sourcePath || (await fs.stat(sourcePath)).size > MAX_FILE_BYTES) throw new Error('SDO file exceeds download limit')
		const title = safeFileName(directDownload.suggestedFilename())
		const outputDir = path.join(outputRoot, `${module.type}-${module.id}`)
		await fs.mkdir(outputDir, { recursive: true })
		const textPath = path.join(outputDir, 'module-text.txt')
		await fs.writeFile(textPath, '', 'utf8')
		const savePath = path.join(outputDir, title)
		await directDownload.saveAs(savePath)
		return { moduleType: module.type, moduleId: module.id, moduleUrl: module.url,
			currentUrl: module.url, title, outputDir, textPath, foundLinks: 1,
			files: [{ title, url: directDownload.url(), path: savePath, status: 'downloaded' as const }] }
	}
	const title = await page.locator('h1, h2, .page-header-headings').first().innerText()
	const outputDir = path.join(outputRoot, safeFileName(`${module.type}-${module.id} - ${title}`))
	const pageText = (await page.locator('body').innerText()).slice(0, 1_000_000)
	const rawLinks = await readLinks(page)
	const links = filterFileLinks(rawLinks.map((link) => ({ text: link.title, href: link.url })))
	await fs.mkdir(outputDir, { recursive: true })
	const textPath = path.join(outputDir, 'module-text.txt')
	await fs.writeFile(textPath, pageText, 'utf8')
	const files: Array<{ title: string; url: string; path: string; status: 'downloaded' | 'skipped' | 'failed'; error?: string }> = []
	let totalBytes = 0
	for (const [index, link] of links.entries()) {
		let fileName = 'file'
		try {
			fileName = safeFileName(decodeURIComponent(new URL(link.href).pathname.split('/').pop() || 'file'))
			const response = await page.context().request.get(link.href, { timeout: 30000, maxRedirects: 0 })
			const contentLength = Number(response.headers()['content-length'])
			const contentType = response.headers()['content-type'] ?? ''
			if (!response.ok() || contentType.includes('text/html') ||
				(Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES)) {
				files.push({ title: link.text || fileName, url: link.href, path: '', status: 'skipped' })
				continue
			}
			const body = await response.body()
			if (body.length > MAX_FILE_BYTES || totalBytes + body.length > MAX_TOTAL_BYTES) {
				files.push({ title: link.text || fileName, url: link.href, path: '', status: 'skipped' })
				continue
			}
			fileName = responseFileName(response.headers()['content-disposition'], fileName)
			const savePath = path.join(outputDir, `${index + 1}-${fileName}`)
			await fs.writeFile(savePath, body)
			totalBytes += body.length
			files.push({ title: link.text || fileName, url: link.href, path: savePath, status: 'downloaded' })
		} catch {
			files.push({ title: link.text || fileName, url: link.href, path: '', status: 'failed', error: 'File download failed' })
		}
	}
	return { moduleType: module.type, moduleId: module.id, moduleUrl: module.url,
		currentUrl: page.url(), title, outputDir, textPath, foundLinks: links.length, files }
}
