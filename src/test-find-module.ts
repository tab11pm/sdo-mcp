import 'dotenv/config'
import { getSdoPage } from './browser.js'
import { ensureLoggedIn, findCourseModule } from './sdo.js'

const courseUrl = process.argv[2]
const query = process.argv.slice(3).join(' ')

if (!courseUrl || !query) {
	console.error('Usage:')
	console.error('npx tsx src/test-find-module.ts "<courseUrl>" "<query>"')
	process.exit(1)
}

const { context, page } = await getSdoPage()

try {
	await ensureLoggedIn(page, context)

	const result = await findCourseModule(page, courseUrl, query)

	console.error('FIND RESULT:')
	console.error(JSON.stringify(result, null, 2))
} catch (error) {
	await page.screenshot({
		path: 'debug-find-module.png',
		fullPage: true,
	})

	console.error('TEST FAILED:')
	console.error(error)
	console.error('Screenshot saved to debug-find-module.png')
} finally {
	await context.close()
}
