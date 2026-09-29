import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const playwright = vi.hoisted(() => ({
	launch: vi.fn(),
}))

vi.mock('playwright', () => ({
	chromium: {
		launch: playwright.launch,
	},
}))

import { getSdoPage, resolveAuthStatePath } from '../src/browser.js'

describe('resolveAuthStatePath', () => {
	it('honors SDO_AUTH_STATE_PATH', () => {
		expect(
			resolveAuthStatePath({ SDO_AUTH_STATE_PATH: '/tmp/state.json' }),
		).toBe('/tmp/state.json')
	})

	it('uses the development state path when the variable is absent', () => {
		expect(resolveAuthStatePath({})).toBe('storage/auth.json')
	})
})

describe('getSdoPage', () => {
	let temporaryDirectory: string | undefined
	const page = { kind: 'page' }
	const context = {
		newPage: vi.fn().mockResolvedValue(page),
	}
	const browser = {
		newContext: vi.fn().mockResolvedValue(context),
	}

	beforeEach(() => {
		vi.clearAllMocks()
		playwright.launch.mockResolvedValue(browser)
		vi.stubEnv('HEADLESS', 'true')
	})

	afterEach(async () => {
		vi.unstubAllEnvs()
		if (temporaryDirectory !== undefined) {
			await rm(temporaryDirectory, { recursive: true, force: true })
			temporaryDirectory = undefined
		}
	})

	it('opens the configured auth state and reports it present', async () => {
		temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'sdo-auth-state-'))
		const authStatePath = path.join(temporaryDirectory, 'state.json')
		await writeFile(authStatePath, '{}', 'utf8')
		vi.stubEnv('SDO_AUTH_STATE_PATH', authStatePath)

		const result = await getSdoPage()

		expect(result).toEqual({ context, page, authStatePresent: true })
		expect(browser.newContext).toHaveBeenCalledWith({
			storageState: authStatePath,
			acceptDownloads: true,
		})
	})

	it('opens an empty context and reports a missing auth state', async () => {
		temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'sdo-auth-state-'))
		const missingPath = path.join(temporaryDirectory, 'missing.json')
		vi.stubEnv('SDO_AUTH_STATE_PATH', missingPath)

		const result = await getSdoPage()

		expect(result).toEqual({ context, page, authStatePresent: false })
		expect(browser.newContext).toHaveBeenCalledWith({
			acceptDownloads: true,
		})
	})
})
