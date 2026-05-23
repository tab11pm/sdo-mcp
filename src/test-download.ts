import 'dotenv/config'
import { getSdoPage } from './browser.js'
import { ensureLoggedIn, downloadSdoModuleFiles } from './sdo.js'

const moduleUrl = process.argv[2]

if (!moduleUrl) {
	console.error('Usage:')
	console.error('npx tsx src/test-module-download.ts <moduleUrl>')
	process.exit(1)
}

const { context, page } = await getSdoPage()

try {
	await ensureLoggedIn(page, context)

	const result = await downloadSdoModuleFiles(page, moduleUrl)

	console.error('DOWNLOAD RESULT:')
	console.error(JSON.stringify(result, null, 2))
} catch (error) {
	await page.screenshot({
		path: 'debug-module-download.png',
		fullPage: true,
	})

	console.error('TEST FAILED:')
	console.error(error)
	console.error('Screenshot saved to debug-module-download.png')
} finally {
	await context.close()
}
