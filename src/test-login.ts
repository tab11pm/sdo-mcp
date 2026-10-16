import 'dotenv/config'

import { runCourseCli } from './course-cli.js'
import { listCourses } from './course-tools.js'

try {
	const courses = await runCourseCli(listCourses)
	console.log(JSON.stringify(courses, null, 2))
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error))
	process.exitCode = 1
}
