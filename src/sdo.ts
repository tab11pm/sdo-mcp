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
