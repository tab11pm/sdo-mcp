import { chromium, BrowserContext, Page } from 'playwright'
import fs from 'node:fs/promises'

const AUTH_PATH = 'storage/auth.json'

export async function getSdoPage(): Promise<{
	context: BrowserContext
	page: Page
}> {
	const browser = await chromium.launch({
		headless: process.env.HEADLESS === 'true',
	})

	let context: BrowserContext

	try {
		await fs.access(AUTH_PATH)
		context = await browser.newContext({
			storageState: AUTH_PATH,
			acceptDownloads: true,
		})
	} catch {
		context = await browser.newContext({
			acceptDownloads: true,
		})
	}

	const page = await context.newPage()

	return { context, page }
}

export async function saveAuthState(context: BrowserContext) {
	await fs.mkdir('storage', { recursive: true })
	await context.storageState({ path: AUTH_PATH })
}
