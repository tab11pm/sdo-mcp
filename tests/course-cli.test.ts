import { beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSdoPage: vi.fn() }))
const sdo = vi.hoisted(() => ({
	ensureLoggedIn: vi.fn(),
	hasAuthenticatedSdoSession: vi.fn(),
}))

vi.mock('../src/browser.js', () => browser)
vi.mock('../src/sdo.js', () => sdo)

import { runCourseCli } from '../src/course-cli.js'

describe('runCourseCli', () => {
	const closeContext = vi.fn()
	const closeBrowser = vi.fn()
	const page = { kind: 'course-cli-page' }

	beforeEach(() => {
		vi.clearAllMocks()
		closeContext.mockResolvedValue(undefined)
		closeBrowser.mockResolvedValue(undefined)
		browser.getSdoPage.mockResolvedValue({
			browser: { close: closeBrowser }, context: { close: closeContext }, page,
		})
		sdo.ensureLoggedIn.mockResolvedValue(undefined)
		sdo.hasAuthenticatedSdoSession.mockResolvedValue(true)
	})

	it('logs in, checks the SDO session, and closes both resources', async () => {
		const action = vi.fn().mockResolvedValue('done')
		await expect(runCourseCli(action)).resolves.toBe('done')
		expect(sdo.ensureLoggedIn).toHaveBeenCalledOnce()
		expect(sdo.hasAuthenticatedSdoSession).toHaveBeenCalledWith(page)
		expect(action).toHaveBeenCalledWith(page)
		expect(closeContext).toHaveBeenCalledOnce()
		expect(closeBrowser).toHaveBeenCalledOnce()
	})

	it('does not run a course action if login fails and still closes resources', async () => {
		sdo.hasAuthenticatedSdoSession.mockResolvedValue(false)
		const action = vi.fn()
		await expect(runCourseCli(action)).rejects.toThrow('SDO authentication required')
		expect(action).not.toHaveBeenCalled()
		expect(closeContext).toHaveBeenCalledOnce()
		expect(closeBrowser).toHaveBeenCalledOnce()
	})
})
