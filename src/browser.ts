import fs from 'node:fs/promises'
import { chromium, type BrowserContext, type Page } from 'playwright'

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
	const authStatePresent = await hasUsableAuthState(authStatePath)

	const context = await browser.newContext({
		...(authStatePresent ? { storageState: authStatePath } : {}),
		acceptDownloads: true,
	})

	let page: Page
	try {
		page = await context.newPage()
	} catch (error) {
		await context.close()
		throw error
	}

	return { context, page, authStatePresent }
}

export async function saveAuthState(context: BrowserContext) {
	await fs.mkdir('storage', { recursive: true })
	await context.storageState({ path: AUTH_PATH })
}
