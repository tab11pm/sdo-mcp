import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { getSdoPage } from './browser.js'
import type { ResolveOnlineLectureResult } from './lecture-resolution.js'
import { resolveOnlineLecture } from './resolve-online-lecture.js'
import {
	downloadSdoModuleFiles,
	ensureLoggedIn,
	findCourseModule,
	hasAuthenticatedSdoSession,
	listCourseModules,
	listCourses,
} from './sdo.js'

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

server.tool(
	'download_module_files',
	'Скачать файлы только из одного конкретного модуля SDO TUSUR: resource или assign',
	{
		moduleUrl: z.string().url(),
	},
	async ({ moduleUrl }) => {
		const { context, page } = await getSdoPage()

		try {
			await ensureLoggedIn(page, context)

			const result = await downloadSdoModuleFiles(page, moduleUrl)

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(result, null, 2),
					},
				],
			}
		} finally {
			await context.close()
		}
	},
)

server.tool(
	'list_course_modules',
	'Получить список материалов и заданий на странице курса SDO TUSUR',
	{
		courseUrl: z.string().url(),
	},
	async ({ courseUrl }) => {
		const { context, page } = await getSdoPage()

		try {
			await ensureLoggedIn(page, context)

			const result = await listCourseModules(page, courseUrl)

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(result, null, 2),
					},
				],
			}
		} finally {
			await context.close()
		}
	},
)

server.tool(
	'find_course_module',
	'Найти материал или задание на странице курса SDO TUSUR по названию',
	{
		courseUrl: z.string().url(),
		query: z.string().min(1),
	},
	async ({ courseUrl, query }) => {
		const { context, page } = await getSdoPage()

		try {
			await ensureLoggedIn(page, context)

			const result = await findCourseModule(page, courseUrl, query)

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(result, null, 2),
					},
				],
			}
		} finally {
			await context.close()
		}
	},
)

const resolveOnlineLectureInputSchema = z
	.object({
		courseUrl: z.string().url().optional(),
		courseQuery: z.string().trim().min(1).optional(),
		lectureQuery: z.string().trim().min(1).optional(),
	})
	.refine(
		({ courseUrl, courseQuery }) =>
			Number(courseUrl !== undefined) + Number(courseQuery !== undefined) ===
			1,
		{
			message: 'Provide exactly one of courseUrl and courseQuery',
		},
	)

server.registerTool(
	'resolve_online_lecture',
	{
		description:
			'Найти BBB-лекцию в SDO по URL или названию курса без автоматического входа',
		inputSchema: resolveOnlineLectureInputSchema,
	},
	async (input) => {
		let sdoPage: Awaited<ReturnType<typeof getSdoPage>> | undefined

		try {
			sdoPage = await getSdoPage()
			const result: ResolveOnlineLectureResult = sdoPage.authStatePresent
				? await resolveOnlineLecture(sdoPage.page, input)
				: { status: 'auth_required' }

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(result),
					},
				],
			}
		} catch {
			throw new Error('SDO page unavailable')
		} finally {
			if (sdoPage !== undefined) {
				try {
					try {
						await sdoPage.context.close()
					} finally {
						await sdoPage.browser.close()
					}
				} catch {
					throw new Error('SDO page unavailable')
				}
			}
		}
	},
)

server.registerTool(
	'check_sdo_auth',
	{
		description: 'Проверить, действует ли локально сохранённая сессия SDO',
	},
	async () => {
		let sdoPage: Awaited<ReturnType<typeof getSdoPage>> | undefined
		try {
			sdoPage = await getSdoPage()
			const authenticated = sdoPage.authStatePresent
				? await hasAuthenticatedSdoSession(sdoPage.page)
				: false
			return {
				content: [{ type: 'text', text: JSON.stringify({ authenticated }) }],
			}
		} catch {
			throw new Error('SDO page unavailable')
		} finally {
			if (sdoPage !== undefined) {
				await sdoPage.context.close()
				await sdoPage.browser.close()
			}
		}
	},
)

server.tool(
	'sdo_login',
	'Войти в SDO через кабинет ТУСУРа и сохранить сессию в SDO_AUTH_STATE_PATH',
	{},
	async () => {
		const { context, page } = await getSdoPage()

		try {
			await ensureLoggedIn(page, context)

			return {
				content: [{ type: 'text', text: JSON.stringify({ status: 'logged_in' }) }],
			}
		} finally {
			await context.close()
		}
	},
)

const transport = new StdioServerTransport()
await server.connect(transport)
