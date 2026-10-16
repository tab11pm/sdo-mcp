import 'dotenv/config'

import { runCourseCli } from './course-cli.js'
import { downloadSdoModuleFiles, validateModuleUrl } from './course-tools.js'

const moduleUrl = process.argv[2]

if (!moduleUrl) {
	console.error('Usage: npx tsx src/test-download.ts "<moduleUrl>"')
	process.exitCode = 2
} else {
	try {
		validateModuleUrl(moduleUrl)
		const result = await runCourseCli((page) => downloadSdoModuleFiles(page, moduleUrl))
		console.log(JSON.stringify(result, null, 2))
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error))
		process.exitCode = 1
	}
}
