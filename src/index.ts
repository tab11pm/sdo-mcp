import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { getSdoPage } from './browser.js'
import { ensureLoggedIn, listCourses } from './sdo.js'

const server = new McpServer({
	name: 'custom-sdo-mcp',
	version: '0.1.0',
})

server.tool(
	'list_courses',
	'Получить список курсов из sdo.tsu.ru',
	{},
	async () => {
		const { context, page } = await getSdoPage()

		try {
			await ensureLoggedIn(page, context)
			const courses = await listCourses(page)

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(courses, null, 2),
					},
				],
			}
		} finally {
			await context.close()
		}
	},
)

server.tool(
	'get_assignment_details',
	'Открыть страницу задания в SDO и вернуть текст задания',
	{
		assignmentUrl: z.string().url(),
	},
	async ({ assignmentUrl }) => {
		const { context, page } = await getSdoPage()

		try {
			await ensureLoggedIn(page, context)

			await page.goto(assignmentUrl)
			await page.waitForLoadState('networkidle')

			const text = await page.locator('body').innerText()

			return {
				content: [
					{
						type: 'text',
						text,
					},
				],
			}
		} finally {
			await context.close()
		}
	},
)

const transport = new StdioServerTransport()
await server.connect(transport)
