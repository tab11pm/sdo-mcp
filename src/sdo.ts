import { Page, BrowserContext } from 'playwright'
import { saveAuthState } from './browser.js'
import {
	isSdoCourseUrl,
	isStableBbbActivityUrl,
	type BbbModuleRef,
} from './lecture-resolution.js'
import {
	SdoAuthenticationRequiredError,
	SdoPageUnavailableError,
} from './sdo-session-errors.js'

const SDO_URL = process.env.SDO_URL ?? 'https://sdo.tusur.ru'
const PROFILE_LOGIN_URL =
	process.env.TUSUR_PROFILE_LOGIN_URL ??
	'https://profile.tusur.ru/users/sign_in'
const SDO_LOGIN_URL = `${SDO_URL}/login/index.php`
const TUSUR_CABINET_LOGIN_LINK_SELECTOR = [
	'a:has-text("Вход через кабинет ТУСУРа")',
	'a[href*="profile.tusur.ru"][href*="/users/sign_in"]',
].join(', ')

interface SdoAnchorRef {
	name: string
	href: string
}

const LOGIN_CONTROL_SELECTOR = [
	'a[href*="/login"]:not([href*="/login/logout.php"]):visible',
	'a[href*="/login/index.php"]:has-text("Log in")',
	'a[href*="/login/index.php"]:has-text("Вход")',
	'a[href*="/login/index.php"]:has-text("Войти")',
	'a:has-text("Вход через кабинет ТУСУРа")',
	'button:has-text("Log in")',
	'button:has-text("Вход через кабинет ТУСУРа")',
	'input[value="Log in"]',
	'input[value*="Вход через кабинет"]',
].join(', ')

const GUEST_TEXT_SELECTOR = [
	'body:has-text("You are not logged in")',
	'body:has-text("Вы зашли гостем")',
].join(', ')

const AUTHENTICATED_CONTROL_SELECTOR = [
	'a[href*="/login/logout.php"]',
].join(', ')

function isAuthenticationDestination(value: string): boolean {
	try {
		const url = new URL(value)
		return (
			(url.protocol === 'https:' &&
				url.hostname === 'sdo.tusur.ru' &&
				url.port === '' &&
				/^\/login(?:\/|$)/u.test(url.pathname)) ||
			(url.protocol === 'https:' &&
				url.hostname === 'profile.tusur.ru' &&
				url.port === '' &&
				/(?:login|sign_in)/u.test(url.pathname))
		)
	} catch {
		return false
	}
}

function assertSuccessfulResponse(
	response: Awaited<ReturnType<Page['goto']>> | undefined,
): void {
	if (response !== null && response !== undefined && !response.ok()) {
		throw new SdoPageUnavailableError()
	}
}

async function readAuthenticationRequiredEvidenceCount(
	page: Page,
): Promise<number> {
	const [loginFormCount, loginControlCount, guestTextCount] = await Promise.all([
		page
			.locator(
				'form[action*="/login"], form:has(input[type="password"]), #login',
			)
			.count(),
		page.locator(LOGIN_CONTROL_SELECTOR).count(),
		page.locator(GUEST_TEXT_SELECTOR).count(),
	])

	return loginFormCount + loginControlCount + guestTextCount
}

async function hasAuthenticatedControl(page: Page): Promise<boolean> {
	return (await page.locator(AUTHENTICATED_CONTROL_SELECTOR).count()) > 0
}

async function isAuthenticatedSdoDocument(
	page: Page,
	response: Awaited<ReturnType<Page['goto']>> | undefined,
): Promise<boolean> {
	assertSuccessfulResponse(response)

	let currentUrl: URL
	try {
		currentUrl = new URL(page.url())
	} catch {
		throw new SdoPageUnavailableError()
	}

	if (isAuthenticationDestination(currentUrl.href)) return false
	if (
		currentUrl.protocol !== 'https:' ||
		currentUrl.hostname !== 'sdo.tusur.ru' ||
		currentUrl.port !== '' ||
		currentUrl.username !== '' ||
		currentUrl.password !== ''
	) {
		throw new SdoPageUnavailableError()
	}
	if (
		currentUrl.pathname !== '/' &&
		!/^\/my(?:\/|$)/u.test(currentUrl.pathname)
	) {
		throw new SdoPageUnavailableError()
	}

	if ((await readAuthenticationRequiredEvidenceCount(page)) > 0) return false

	if (await hasAuthenticatedControl(page)) return true

	throw new SdoPageUnavailableError()
}

export function extractBbbModules(
	anchors: readonly SdoAnchorRef[],
): BbbModuleRef[] {
	const modules = new Map<string, BbbModuleRef>()

	for (const anchor of anchors) {
		const name = anchor.name.replace(/\s+/gu, ' ').trim()
		if (!name || !isStableBbbActivityUrl(anchor.href)) continue

		const parsedUrl = new URL(anchor.href)
		const activityUrl = `https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=${parsedUrl.searchParams.get('id')}`

		if (!modules.has(activityUrl)) {
			modules.set(activityUrl, { name, activityUrl })
		}
	}

	return [...modules.values()]
}

export async function hasAuthenticatedSdoSession(
	page: Page,
): Promise<boolean> {
	const response = await page.goto(`${SDO_URL}/`, {
		waitUntil: 'domcontentloaded',
		timeout: 30000,
	})

	return isAuthenticatedSdoDocument(page, response)
}

export async function listBbbCourseModules(
	page: Page,
	courseUrl: string,
): Promise<BbbModuleRef[]> {
	if (!isSdoCourseUrl(courseUrl)) {
		throw new Error('Invalid SDO course URL')
	}

	const response = await page.goto(courseUrl, {
		waitUntil: 'domcontentloaded',
		timeout: 30000,
	})
	assertSuccessfulResponse(response)

	const finalUrl = page.url()
	if (isAuthenticationDestination(finalUrl)) {
		throw new SdoAuthenticationRequiredError()
	}
	if (
		!isSdoCourseUrl(finalUrl) ||
		new URL(finalUrl).href !== new URL(courseUrl).href
	) {
		throw new Error('SDO course navigation left the validated course page')
	}
	if ((await readAuthenticationRequiredEvidenceCount(page)) > 0) {
		throw new SdoAuthenticationRequiredError()
	}
	if (!(await hasAuthenticatedControl(page))) {
		throw new SdoPageUnavailableError()
	}

	const anchors = await page.locator('a[href]').evaluateAll((links) =>
		links.map((link) => ({
			name: link.textContent ?? '',
			href: (link as HTMLAnchorElement).href,
		})),
	)

	return extractBbbModules(anchors)
}

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

async function resolveTusurCabinetLoginUrl(
	page: Page,
): Promise<string | undefined> {
	const cabinetLink = page.locator(TUSUR_CABINET_LOGIN_LINK_SELECTOR).first()

	if ((await cabinetLink.count()) === 0) return undefined

	const href = await cabinetLink
		.evaluate((link) => (link as HTMLAnchorElement).href)
		.catch(() => '')

	return href || undefined
}

async function saveDebugScreenshot(
	page: Page,
	fileName: string,
): Promise<string | undefined> {
	if (process.env.SDO_DEBUG_SCREENSHOTS !== '1') return undefined

	await page.screenshot({ path: fileName, fullPage: true })
	return fileName
}

async function fillTusurProfileLoginForm(page: Page): Promise<void> {
	const emailInput = page.locator(
		'input[name="user[email]"], input[type="email"], input[name="email"], input[id*="email"], input[placeholder*="Email"]',
	)

	const passwordInput = page.locator(
		'input[name="user[password]"], input[type="password"], input[name="password"], input[id*="password"], input[placeholder*="Password"]',
	)

	const hasLoginForm =
		(await emailInput.count()) > 0 && (await passwordInput.count()) > 0

	if (!hasLoginForm) {
		console.error(
			'TUSUR profile login form not found. Reusing the existing profile session.',
		)
		return
	}

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

	await saveDebugScreenshot(page, 'debug-profile-filled.png')

	console.error('Submitting TUSUR login form...')

	const submitButton = page.locator(
		'form input[type="submit"], form button[type="submit"], form button:has-text("Войти"), form button:has-text("Sign in")',
	)

	await Promise.all([
		page
			.waitForLoadState('domcontentloaded', { timeout: 30000 })
			.catch(() => {}),
		submitButton.first().click(),
	])

	await page.waitForTimeout(4000)

	const failureScreenshot = await saveDebugScreenshot(page, 'debug-profile-after-submit.png')

	const bodyText = await page
		.locator('body')
		.innerText()
		.catch(() => '')

	if (
		bodyText.includes('Невер') ||
		bodyText.includes('Invalid') ||
		bodyText.includes('Signed out successfully')
	) {
		throw new Error(
			`TUSUR profile login failed. Check login/password or selector.${failureScreenshot ? ` Screenshot: ${failureScreenshot}` : ''}`,
		)
	}
}

async function loginToTusurProfile(page: Page) {
	console.error('Opening SDO login page to start TUSUR profile login...')

	await page.goto(SDO_LOGIN_URL, {
		waitUntil: 'domcontentloaded',
		timeout: 30000,
	})

	await page.waitForTimeout(1500)

	if (await hasAuthenticatedControl(page)) {
		console.error('SDO session already active after opening the login page.')
		return
	}

	const cabinetLoginUrl = await resolveTusurCabinetLoginUrl(page)
	const profileLoginUrl = cabinetLoginUrl ?? PROFILE_LOGIN_URL

	console.error('Opening TUSUR profile login page:', profileLoginUrl)

	await page.goto(profileLoginUrl, {
		waitUntil: 'domcontentloaded',
		timeout: 30000,
	})

	await page.waitForTimeout(2000)

	await saveDebugScreenshot(page, 'debug-profile-opened.png')

	await fillTusurProfileLoginForm(page)
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

		await fillTusurProfileLoginForm(page)

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
		const failureScreenshot = await saveDebugScreenshot(page, 'debug-sdo-login-failed.png')

		throw new Error(
			`SDO login failed. Login form is still visible.${failureScreenshot ? ` Screenshot: ${failureScreenshot}` : ''}`,
		)
	}

	await saveAuthState(context)
	console.error('SDO login successful. Auth state saved.')
}

async function extractCourses(page: Page) {
	return page.locator('a').evaluateAll((links) =>
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
}

export async function listAuthenticatedCourses(page: Page) {
	const response = await page.goto(`${SDO_URL}/`, {
		waitUntil: 'networkidle',
	})

	if (!(await isAuthenticatedSdoDocument(page, response))) {
		throw new SdoAuthenticationRequiredError()
	}

	return extractCourses(page)
}
