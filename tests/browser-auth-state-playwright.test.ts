import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { getSdoPage } from '../src/browser.js'

describe('real Playwright auth-state restoration', () => {
	let temporaryDirectory: string | undefined

	afterEach(async () => {
		vi.unstubAllEnvs()
		if (temporaryDirectory !== undefined) {
			await rm(temporaryDirectory, { recursive: true, force: true })
			temporaryDirectory = undefined
		}
	})

	it('falls back to auth_required state when Playwright rejects a structurally valid cookie', async () => {
		temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'sdo-auth-state-'))
		const authStatePath = path.join(temporaryDirectory, 'state.json')
		await writeFile(
			authStatePath,
			JSON.stringify({
				cookies: [
					{
						name: 'fixtureCookie',
						value: 'fixture',
						domain: '',
						path: '/',
						expires: -1,
						httpOnly: true,
						secure: true,
						sameSite: 'Lax',
					},
				],
				origins: [],
			}),
			'utf8',
		)
		vi.stubEnv('HEADLESS', 'true')
		vi.stubEnv('SDO_AUTH_STATE_PATH', authStatePath)

		const sdoPage = await getSdoPage()
		try {
			expect(sdoPage.authStatePresent).toBe(false)
		} finally {
			await sdoPage.context.close()
			await sdoPage.browser.close()
		}
	})
})
