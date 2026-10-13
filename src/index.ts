import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { getSdoPage } from './browser.js'
import type { ResolveOnlineLectureResult } from './lecture-resolution.js'
import { resolveOnlineLecture } from './resolve-online-lecture.js'
import {
	ensureLoggedIn,
	hasAuthenticatedSdoSession,
} from './sdo.js'

const server = new McpServer({
	name: 'custom-sdo-mcp',
	version: '0.1.0',
})

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
