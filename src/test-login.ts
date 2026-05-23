import 'dotenv/config'
import { getSdoPage } from './browser.js'
import { ensureLoggedIn, listCourses } from './sdo.js'

const { context, page } = await getSdoPage()

try {
	await ensureLoggedIn(page, context)

	const courses = await listCourses(page)

	console.log('COURSES:')
	console.log(JSON.stringify(courses, null, 2))
} catch (error) {
	console.error('TEST FAILED:')
	console.error(error)
} finally {
	await context.close()
}
