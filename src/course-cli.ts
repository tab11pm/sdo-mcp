import type { Page } from 'playwright'

import { getSdoPage } from './browser.js'
import { ensureLoggedIn, hasAuthenticatedSdoSession } from './sdo.js'
import { SdoAuthenticationRequiredError } from './sdo-session-errors.js'

export async function runCourseCli<T>(action: (page: Page) => Promise<T>): Promise<T> {
	const { browser, context, page } = await getSdoPage()
	try {
		await ensureLoggedIn(page, context)
		if (!(await hasAuthenticatedSdoSession(page))) {
			throw new SdoAuthenticationRequiredError()
		}
		return await action(page)
	} finally {
		try {
			await context.close()
		} finally {
			await browser.close()
		}
	}
}
