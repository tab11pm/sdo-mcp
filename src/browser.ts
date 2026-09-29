import fs from 'node:fs/promises'
import { chromium, type BrowserContext, type Page } from 'playwright'

const AUTH_PATH = 'storage/auth.json'

interface AuthStateEnvironment {
	SDO_AUTH_STATE_PATH?: string
}

export function resolveAuthStatePath(env: AuthStateEnvironment): string {
	const configuredPath = env.SDO_AUTH_STATE_PATH

	return configuredPath?.trim() ? configuredPath : AUTH_PATH
}

export async function getSdoPage(): Promise<{
	context: BrowserContext
	page: Page
	authStatePresent: boolean
}> {
	const browser = await chromium.launch({
		headless: process.env.HEADLESS === 'true',
	})

	const authStatePath = resolveAuthStatePath(process.env)
	let authStatePresent = false

	try {
		await fs.access(authStatePath)
		authStatePresent = true
	} catch {
		// A missing or unreadable state file is handled as unauthenticated.
	}

	const context = await browser.newContext({
		...(authStatePresent ? { storageState: authStatePath } : {}),
		acceptDownloads: true,
	})

	const page = await context.newPage()

	return { context, page, authStatePresent }
}

export async function saveAuthState(context: BrowserContext) {
	await fs.mkdir('storage', { recursive: true })
	await context.storageState({ path: AUTH_PATH })
}
