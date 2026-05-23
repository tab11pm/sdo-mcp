import fs from 'node:fs/promises'
import path from 'node:path'
import { Page, BrowserContext } from 'playwright'
import { saveAuthState } from './browser.js'

const SDO_URL = process.env.SDO_URL ?? 'https://sdo.tusur.ru'
const PROFILE_LOGIN_URL =
	process.env.TUSUR_PROFILE_LOGIN_URL ??
	'https://profile.tusur.ru/en/users/sign_in'

async function isLoggedIntoSdo(page: Page): Promise<boolean> {
	console.error('Checking SDO login state...')

	await page.goto(`${SDO_URL}/`, {
		waitUntil: 'domcontentloaded',
		timeout: 30000,
	})

	await page.waitForTimeout(2000)

	const currentUrl = page.url()
	const bodyText = await page
		.locator('body')
		.innerText()
		.catch(() => '')

	console.error('SDO check URL:', currentUrl)

	const courseLinkCount = await page
		.locator('a[href*="/course/view.php"]')
		.count()
		.catch(() => 0)

	if (courseLinkCount > 0) {
		console.error(
			`Found ${courseLinkCount} course links. Already logged into SDO.`,
		)
		return true
	}

	const hasPasswordInput =
		(await page
			.locator('input[type="password"], input[name="password"]')
			.count()
			.catch(() => 0)) > 0

	const hasTusurLoginButton =
		(await page
			.locator(
				'a:has-text("Вход через кабинет ТУСУРа"), button:has-text("Вход через кабинет ТУСУРа"), input[value*="Вход через кабинет"]',
			)
			.count()
			.catch(() => 0)) > 0

	const isLogoutConfirmation =
		bodyText.includes('Вы хотите выйти') ||
		bodyText.includes('Do you want to log out') ||
		bodyText.includes('Log out')

	if (isLogoutConfirmation) {
		console.error(
			'SDO shows logout confirmation, but this means session exists.',
		)
		return true
	}

	if (
		hasPasswordInput ||
		hasTusurLoginButton ||
		currentUrl.includes('/login')
	) {
		console.error('SDO login form/button detected. Not logged in.')
		return false
	}

	if (
		currentUrl === `${SDO_URL}/` ||
		currentUrl.startsWith(`${SDO_URL}/?redirect=0`) ||
		currentUrl.includes('/my/')
	) {
		console.error(
			'SDO main page opened without login form. Treating as logged in.',
		)
		return true
	}

	console.error(
		'Could not confidently detect SDO session. Treating as not logged in.',
	)
	return false
}

async function loginToTusurProfile(page: Page) {
	console.error('Opening TUSUR profile login page...')

	await page.goto(PROFILE_LOGIN_URL, {
		waitUntil: 'domcontentloaded',
		timeout: 30000,
	})

	await page.screenshot({
		path: 'debug-profile-opened.png',
		fullPage: true,
	})

	const emailInput = page.locator(
		'input[type="email"], input[name="user[email]"], input[name="email"], input[id*="email"], input[placeholder*="Email"]',
	)

	const passwordInput = page.locator(
		'input[type="password"], input[name="user[password]"], input[name="password"], input[id*="password"], input[placeholder*="Password"]',
	)

	await emailInput.first().waitFor({
		state: 'visible',
		timeout: 15000,
	})

	await passwordInput.first().waitFor({
		state: 'visible',
		timeout: 15000,
	})

	console.error('Filling TUSUR login form...')

	await emailInput.first().fill(process.env.SDO_USERNAME ?? '')
	await passwordInput.first().fill(process.env.SDO_PASSWORD ?? '')

	await page.screenshot({
		path: 'debug-profile-filled.png',
		fullPage: true,
	})

	console.error('Submitting TUSUR login form...')

	const submitButton = page.locator(
		'button[type="submit"], input[type="submit"], button:has-text("Sign in"), input[value="Sign in"]',
	)

	await Promise.all([
		page
			.waitForLoadState('domcontentloaded', { timeout: 30000 })
			.catch(() => {}),
		submitButton.first().click(),
	])

	await page.waitForTimeout(3000)

	await page.screenshot({
		path: 'debug-profile-after-submit.png',
		fullPage: true,
	})

	const currentUrl = page.url()
	const bodyText = await page
		.locator('body')
		.innerText()
		.catch(() => '')

	console.error('After TUSUR login URL:', currentUrl)

	if (
		bodyText.includes('Invalid') ||
		bodyText.includes('Невер') ||
		bodyText.includes('Signed out successfully')
	) {
		throw new Error(
			'TUSUR profile login failed. Check login/password or selector. Screenshot: debug-profile-after-submit.png',
		)
	}
}

async function loginToSdoThroughTusur(page: Page) {
	console.error('Opening SDO main page...')

	await page.goto(`${SDO_URL}/`, {
		waitUntil: 'domcontentloaded',
		timeout: 30000,
	})

	await page.waitForTimeout(2000)

	let currentUrl = page.url()
	let bodyText = await page
		.locator('body')
		.innerText()
		.catch(() => '')

	console.error('SDO URL after opening main page:', currentUrl)

	// Если SDO показывает страницу выхода — не подтверждаем выход.
	// Просто возвращаемся на главную SDO.
	if (
		bodyText.includes('Вы хотите выйти') ||
		bodyText.includes('Do you want to log out') ||
		bodyText.includes('Log out')
	) {
		console.error('SDO shows logout confirmation. Returning to main page.')

		await page.goto(`${SDO_URL}/`, {
			waitUntil: 'domcontentloaded',
			timeout: 30000,
		})

		await page.waitForTimeout(2000)

		currentUrl = page.url()
		bodyText = await page
			.locator('body')
			.innerText()
			.catch(() => '')
	}

	// Успешный кейс: после профиля нас уже пустило в SDO.
	if (
		currentUrl === `${SDO_URL}/` ||
		currentUrl.startsWith(`${SDO_URL}/?redirect=0`) ||
		currentUrl.includes('/my/')
	) {
		const hasPasswordInput =
			(await page
				.locator('input[type="password"], input[name="password"]')
				.count()
				.catch(() => 0)) > 0

		if (!hasPasswordInput) {
			console.error(
				'SDO main page opened without login form. Treating as logged in.',
			)
			return
		}
	}

	// Если на главной есть кнопка входа через кабинет ТУСУРа — нажимаем её.
	const tusurCabinetButton = page.locator(
		'a:has-text("Вход через кабинет ТУСУРа"), button:has-text("Вход через кабинет ТУСУРа"), input[value*="Вход через кабинет"]',
	)

	if ((await tusurCabinetButton.count()) > 0) {
		console.error('Clicking TUSUR cabinet login button...')

		await tusurCabinetButton.first().click()
		await page
			.waitForLoadState('domcontentloaded', { timeout: 30000 })
			.catch(() => {})
		await page.waitForTimeout(2000)

		currentUrl = page.url()
		bodyText = await page
			.locator('body')
			.innerText()
			.catch(() => '')

		console.error('SDO URL after TUSUR cabinet button:', currentUrl)
	}

	// Ещё раз проверяем страницу выхода после клика.
	if (
		bodyText.includes('Вы хотите выйти') ||
		bodyText.includes('Do you want to log out') ||
		bodyText.includes('Log out')
	) {
		console.error(
			'Logout confirmation after SDO login click. Returning to main page.',
		)

		await page.goto(`${SDO_URL}/`, {
			waitUntil: 'domcontentloaded',
			timeout: 30000,
		})

		await page.waitForTimeout(2000)
	}
}

export async function ensureLoggedIn(page: Page, context: BrowserContext) {
	const alreadyLoggedIn = await isLoggedIntoSdo(page)

	if (alreadyLoggedIn) {
		console.error('Already logged into SDO.')
		return
	}

	console.error('Logging into TUSUR profile...')
	await loginToTusurProfile(page)

	console.error('Opening SDO and confirming TUSUR login...')
	await loginToSdoThroughTusur(page)

	const currentUrl = page.url()

	if (currentUrl.startsWith(`${SDO_URL}/?redirect=0`)) {
		console.error(
			'SDO redirected to main page after TUSUR login. Treating as logged in.',
		)
		await saveAuthState(context)
		return
	}

	await page.goto(`${SDO_URL}/`, {
		waitUntil: 'domcontentloaded',
		timeout: 30000,
	})

	await page.waitForTimeout(2000)

	const finalUrl = page.url()

	const usernameInputCount = await page
		.locator('input[name="username"], input[type="email"]')
		.count()
		.catch(() => 0)

	const passwordInputCount = await page
		.locator('input[name="password"], input[type="password"]')
		.count()
		.catch(() => 0)

	const hasLoginForm = usernameInputCount > 0 && passwordInputCount > 0

	if (finalUrl.includes('/login') && hasLoginForm) {
		await page.screenshot({
			path: 'debug-sdo-login-failed.png',
			fullPage: true,
		})

		throw new Error(
			'SDO login failed. Login form is still visible. Screenshot: debug-sdo-login-failed.png',
		)
	}

	await saveAuthState(context)
	console.error('SDO login successful. Auth state saved.')
}

export async function listCourses(page: Page) {
	await page.goto(`${SDO_URL}/`, {
		waitUntil: 'networkidle',
	})

	const courses = await page.locator('a').evaluateAll((links) =>
		links
			.map((a) => ({
				title: a.textContent?.trim() ?? '',
				url: (a as HTMLAnchorElement).href,
			}))
			.filter(
				(x) =>
					x.title &&
					(x.url.includes('/course/view.php') ||
						x.url.includes('courseid') ||
						x.url.includes('/course/')),
			),
	)

	return courses
}

function safeFileName(name: string): string {
	return name
		.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 180)
}

function guessFileNameFromUrl(url: string): string {
	try {
		const parsed = new URL(url)
		const last = parsed.pathname.split('/').filter(Boolean).pop()

		if (last) {
			return safeFileName(decodeURIComponent(last))
		}
	} catch {
		// ignore
	}

	return `file-${Date.now()}`
}

function getSdoModuleType(
	url: string,
): 'course' | 'resource' | 'assign' | 'unknown' {
	if (url.includes('/course/view.php')) return 'course'
	if (url.includes('/mod/resource/view.php')) return 'resource'
	if (url.includes('/mod/assign/view.php')) return 'assign'
	return 'unknown'
}

function getIdFromUrl(url: string): string {
	try {
		return new URL(url).searchParams.get('id') ?? 'unknown'
	} catch {
		return 'unknown'
	}
}

export async function listCourseModules(page: Page, courseUrl: string) {
	await page.goto(courseUrl, {
		waitUntil: 'domcontentloaded',
		timeout: 30000,
	})

	await page.waitForTimeout(2000)

	const currentUrl = page.url()

	if (!currentUrl.includes('/course/view.php')) {
		throw new Error(`Expected course page, got: ${currentUrl}`)
	}

	const modules = await page.locator('a[href]').evaluateAll((anchors) =>
		anchors
			.map((a) => {
				const el = a as HTMLAnchorElement
				const href = el.href
				const title = el.textContent?.replace(/\s+/g, ' ').trim() ?? ''

				let type = 'unknown'

				if (href.includes('/mod/resource/view.php')) type = 'resource'
				if (href.includes('/mod/assign/view.php')) type = 'assign'
				if (href.includes('/mod/forum/view.php')) type = 'forum'
				if (href.includes('/mod/quiz/view.php')) type = 'quiz'

				return {
					title,
					url: href,
					type,
				}
			})
			.filter((x) => {
				if (!x.title) return false

				return (
					x.url.includes('/mod/resource/view.php') ||
					x.url.includes('/mod/assign/view.php') ||
					x.url.includes('/mod/forum/view.php') ||
					x.url.includes('/mod/quiz/view.php')
				)
			}),
	)

	const unique = new Map<string, { title: string; url: string; type: string }>()

	for (const module of modules) {
		if (!unique.has(module.url)) {
			unique.set(module.url, module)
		}
	}

	return {
		courseUrl,
		modules: [...unique.values()],
	}
}

export async function downloadSdoModuleFiles(
	page: Page,
	moduleUrl: string,
	outputRoot = 'downloads',
) {
	const moduleType = getSdoModuleType(moduleUrl)
	const moduleId = getIdFromUrl(moduleUrl)

	if (moduleType === 'course') {
		throw new Error(
			'downloadSdoModuleFiles received a course URL. Use list_course_modules first, then pass a specific resource or assignment URL.',
		)
	}

	if (moduleType === 'unknown') {
		throw new Error(`Unsupported SDO URL: ${moduleUrl}`)
	}

	console.error(`Opening ${moduleType} module:`, moduleUrl)

	await page.goto(moduleUrl, {
		waitUntil: 'domcontentloaded',
		timeout: 30000,
	})

	await page.waitForTimeout(2000)

	const currentUrl = page.url()

	const title = await page
		.locator('h1, h2, .page-header-headings')
		.first()
		.innerText()
		.catch(() => `${moduleType}-${moduleId}`)

	const folderName = safeFileName(`${moduleType}-${moduleId} - ${title}`)
	const outputDir = path.join(outputRoot, folderName)

	await fs.mkdir(outputDir, { recursive: true })

	const pageText = await page
		.locator('body')
		.innerText()
		.catch(() => '')
	const textPath = path.join(outputDir, 'module-text.txt')

	await fs.writeFile(textPath, pageText, 'utf8')

	const downloaded: Array<{
		title: string
		url: string
		path: string
		status: 'downloaded' | 'skipped' | 'failed'
		error?: string
	}> = []

	// ВАЖНО:
	// Для Moodle resource страница может сразу начать download.
	// Поэтому сначала пробуем поймать download event.
	if (moduleType === 'resource') {
		try {
			console.error('Trying resource direct download...')

			const downloadPromise = page.waitForEvent('download', {
				timeout: 5000,
			})

			await page.reload({
				waitUntil: 'domcontentloaded',
				timeout: 30000,
			})

			const download = await downloadPromise.catch(() => null)

			if (download) {
				const fileName = safeFileName(
					download.suggestedFilename() || `${moduleId}-resource`,
				)
				const savePath = path.join(outputDir, fileName)

				await download.saveAs(savePath)

				downloaded.push({
					title: fileName,
					url: moduleUrl,
					path: savePath,
					status: 'downloaded',
				})

				return {
					moduleType,
					moduleId,
					moduleUrl,
					currentUrl,
					title,
					outputDir,
					textPath,
					foundLinks: 1,
					files: downloaded,
				}
			}
		} catch (error) {
			console.error('Direct resource download did not happen:', error)
		}
	}

	// Если прямой download не произошёл, ищем реальные pluginfile.php ссылки
	const links = await collectModuleFileLinks(page)

	console.error(
		`Found ${links.length} file links inside ${moduleType} ${moduleId}.`,
	)

	for (const link of links) {
		const fallbackName = guessFileNameFromUrl(link.href)
		const displayTitle = safeFileName(link.text || fallbackName)

		try {
			console.error('Downloading file:', link.href)

			const response = await page.context().request.get(link.href, {
				timeout: 30000,
			})

			if (!response.ok()) {
				downloaded.push({
					title: displayTitle,
					url: link.href,
					path: '',
					status: 'failed',
					error: `HTTP ${response.status()} ${response.statusText()}`,
				})

				continue
			}

			const contentType = response.headers()['content-type'] ?? ''

			if (contentType.includes('text/html')) {
				downloaded.push({
					title: displayTitle,
					url: link.href,
					path: '',
					status: 'skipped',
					error: 'Response is HTML, not a file.',
				})

				continue
			}

			const body = await response.body()

			let fileName = fallbackName
			const contentDisposition = response.headers()['content-disposition']

			if (contentDisposition) {
				const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
				const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i)

				if (utf8Match?.[1]) {
					fileName = decodeURIComponent(utf8Match[1])
				} else if (plainMatch?.[1]) {
					fileName = plainMatch[1]
				}
			}

			fileName = safeFileName(fileName || displayTitle || fallbackName)

			const savePath = path.join(outputDir, fileName)

			await fs.writeFile(savePath, body)

			downloaded.push({
				title: displayTitle,
				url: link.href,
				path: savePath,
				status: 'downloaded',
			})
		} catch (error) {
			downloaded.push({
				title: displayTitle,
				url: link.href,
				path: '',
				status: 'failed',
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	return {
		moduleType,
		moduleId,
		moduleUrl,
		currentUrl,
		title,
		outputDir,
		textPath,
		foundLinks: links.length,
		files: downloaded,
	}
}

async function collectModuleFileLinks(page: Page) {
	const links = await page.locator('a[href]').evaluateAll((anchors) =>
		anchors
			.map((a) => {
				const el = a as HTMLAnchorElement

				return {
					text: el.textContent?.replace(/\s+/g, ' ').trim() ?? '',
					href: el.href,
				}
			})
			.filter((x) => x.href),
	)

	const fileLinks = links.filter((link) => {
		const href = link.href.toLowerCase()

		// Нельзя переходить по другим страницам курса
		if (href.includes('/course/view.php')) return false
		if (href.includes('/mod/assign/view.php')) return false
		if (href.includes('/mod/resource/view.php')) return false
		if (href.includes('/mod/forum/')) return false
		if (href.includes('/mod/quiz/')) return false
		if (href.includes('/user/')) return false
		if (href.includes('/grade/')) return false
		if (href.includes('/calendar/')) return false

		return (
			href.includes('/pluginfile.php/') ||
			href.includes('/webservice/pluginfile.php/') ||
			href.endsWith('.pdf') ||
			href.endsWith('.doc') ||
			href.endsWith('.docx') ||
			href.endsWith('.xls') ||
			href.endsWith('.xlsx') ||
			href.endsWith('.ppt') ||
			href.endsWith('.pptx') ||
			href.endsWith('.zip') ||
			href.endsWith('.rar') ||
			href.endsWith('.7z') ||
			href.endsWith('.txt') ||
			href.endsWith('.jpg') ||
			href.endsWith('.jpeg') ||
			href.endsWith('.png')
		)
	})

	const unique = new Map<string, { text: string; href: string }>()

	for (const link of fileLinks) {
		try {
			const parsed = new URL(link.href)
			parsed.hash = ''

			const normalized = parsed.toString()

			if (!unique.has(normalized)) {
				unique.set(normalized, {
					text: link.text,
					href: normalized,
				})
			}
		} catch {
			if (!unique.has(link.href)) {
				unique.set(link.href, link)
			}
		}
	}

	return [...unique.values()]
}
