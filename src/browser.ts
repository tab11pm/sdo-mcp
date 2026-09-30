import fs from 'node:fs/promises'
import {
	chromium,
	type Browser,
	type BrowserContext,
	type Page,
} from 'playwright'

const AUTH_PATH = 'storage/auth.json'

interface AuthStateEnvironment {
	SDO_AUTH_STATE_PATH?: string
}

interface JsonObject {
	[key: string]: unknown
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStorageStateCookie(value: unknown): boolean {
	if (!isJsonObject(value)) return false

	return (
		typeof value.name === 'string' &&
		typeof value.value === 'string' &&
		typeof value.domain === 'string' &&
		typeof value.path === 'string' &&
		typeof value.expires === 'number' &&
		Number.isFinite(value.expires) &&
		typeof value.httpOnly === 'boolean' &&
		typeof value.secure === 'boolean' &&
		(value.sameSite === 'Strict' ||
			value.sameSite === 'Lax' ||
			value.sameSite === 'None')
	)
}

function isStorageStateOrigin(value: unknown): boolean {
	if (!isJsonObject(value) || typeof value.origin !== 'string') return false
	if (!Array.isArray(value.localStorage)) return false

	return value.localStorage.every(
		(item) =>
			isJsonObject(item) &&
			typeof item.name === 'string' &&
			typeof item.value === 'string',
	)
}

function isStorageState(value: unknown): boolean {
	return (
		isJsonObject(value) &&
		Array.isArray(value.cookies) &&
		value.cookies.every(isStorageStateCookie) &&
		Array.isArray(value.origins) &&
		value.origins.every(isStorageStateOrigin)
	)
}

async function hasUsableAuthState(authStatePath: string): Promise<boolean> {
	try {
		const contents = await fs.readFile(authStatePath, 'utf8')
		return isStorageState(JSON.parse(contents) as unknown)
	} catch {
		return false
	}
}

function isStorageStateRestoreError(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.message.includes('Error setting storage state')
	)
}

export function resolveAuthStatePath(env: AuthStateEnvironment): string {
	const configuredPath = env.SDO_AUTH_STATE_PATH

	return configuredPath?.trim() ? configuredPath : AUTH_PATH
}

export async function getSdoPage(): Promise<{
	browser: Browser
	context: BrowserContext
	page: Page
	authStatePresent: boolean
}> {
	const browser = await chromium.launch({
		headless: process.env.HEADLESS === 'true',
	})
	let context: BrowserContext | undefined
	try {
		const authStatePath = resolveAuthStatePath(process.env)
		let authStatePresent = await hasUsableAuthState(authStatePath)

		try {
			context = await browser.newContext({
				...(authStatePresent ? { storageState: authStatePath } : {}),
				acceptDownloads: true,
			})
		} catch (error) {
			if (!authStatePresent || !isStorageStateRestoreError(error)) {
				throw error
			}

			authStatePresent = false
			context = await browser.newContext({ acceptDownloads: true })
		}
		const page = await context.newPage()

		return { browser, context, page, authStatePresent }
	} catch (error) {
		if (context !== undefined) {
			try {
				await context.close()
			} finally {
				await browser.close()
			}
		} else {
			await browser.close()
		}
		throw error
	}
}

export async function saveAuthState(context: BrowserContext) {
	await fs.mkdir('storage', { recursive: true })
	await context.storageState({ path: AUTH_PATH })
}
