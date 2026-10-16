import 'dotenv/config'

import { runCourseCli } from './course-cli.js'
import { findCourseModule, validateCourseUrl } from './course-tools.js'

const courseUrl = process.argv[2]
const query = process.argv.slice(3).join(' ').trim()

if (!courseUrl || !query) {
	console.error('Usage: npx tsx src/test-find-module.ts "<courseUrl>" "<query>"')
	process.exitCode = 2
} else {
	try {
		validateCourseUrl(courseUrl)
		const result = await runCourseCli((page) => findCourseModule(page, courseUrl, query))
		console.log(JSON.stringify(result, null, 2))
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error))
		process.exitCode = 1
	}
}
