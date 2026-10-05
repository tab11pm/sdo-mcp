import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'

interface Registration {
	kind: 'tool' | 'registerTool'
	args: unknown[]
}

const mcp = vi.hoisted(() => ({
	registrations: [] as Registration[],
	connect: vi.fn().mockResolvedValue(undefined),
}))

const browser = vi.hoisted(() => ({
	getSdoPage: vi.fn(),
}))

const sdo = vi.hoisted(() => ({
	downloadSdoModuleFiles: vi.fn(),
	ensureLoggedIn: vi.fn(),
	findCourseModule: vi.fn(),
	hasAuthenticatedSdoSession: vi.fn(),
	listBbbCourseModules: vi.fn(),
	listAuthenticatedCourses: vi.fn(),
	listCourseModules: vi.fn(),
	listCourses: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
	McpServer: class {
		tool(...args: unknown[]) {
			mcp.registrations.push({ kind: 'tool', args })
		}

		registerTool(...args: unknown[]) {
			mcp.registrations.push({ kind: 'registerTool', args })
		}

		connect = mcp.connect
	},
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
	StdioServerTransport: class {},
}))

vi.mock('../src/browser.js', () => browser)
vi.mock('../src/sdo.js', () => sdo)

type ResolveHandler = (
	input: {
		courseUrl?: string
		courseQuery?: string
		lectureQuery?: string
	},
) => Promise<{ content: Array<{ type: 'text'; text: string }> }>

function resolutionRegistration(): Registration {
	const registration = mcp.registrations.find(
		({ args }) => args[0] === 'resolve_online_lecture',
	)
	if (registration === undefined) {
		throw new Error('resolve_online_lecture was not registered')
	}
	return registration
}

function authCheckRegistration(): Registration {
	const registration = mcp.registrations.find(
		({ args }) => args[0] === 'check_sdo_auth',
	)
	if (registration === undefined) throw new Error('check_sdo_auth was not registered')
	return registration
}

describe('resolve_online_lecture MCP boundary', () => {
	beforeAll(async () => {
		await import('../src/index.js')
	})

	beforeEach(() => {
		vi.clearAllMocks()
		sdo.hasAuthenticatedSdoSession.mockResolvedValue(true)
		sdo.listAuthenticatedCourses.mockResolvedValue([
			{
				title: 'Физика',
				url: 'https://sdo.tusur.ru/course/view.php?id=20',
			},
		])
		sdo.listBbbCourseModules.mockResolvedValue([
			{
				name: 'Лекция 1',
				activityUrl:
					'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=201',
			},
		])
	})

	it('keeps the five existing tools and registers the new tool once', () => {
		expect(
			mcp.registrations
				.filter(({ kind }) => kind === 'tool')
				.map(({ args }) => args[0]),
		).toEqual([
			'list_courses',
			'get_assignment_details',
			'download_module_files',
			'list_course_modules',
			'find_course_module',
		])
		expect(
			mcp.registrations.filter(
				({ args }) => args[0] === 'resolve_online_lecture',
			),
		).toHaveLength(1)
		expect(
			mcp.registrations.filter(({ args }) => args[0] === 'check_sdo_auth'),
		).toHaveLength(1)
	})

	it('reports an unusable saved session without exposing session data', async () => {
		const close = vi.fn().mockResolvedValue(undefined)
		const closeBrowser = vi.fn().mockResolvedValue(undefined)
		browser.getSdoPage.mockResolvedValue({
			browser: { close: closeBrowser }, context: { close }, page: {}, authStatePresent: true,
		})
		sdo.hasAuthenticatedSdoSession.mockResolvedValue(false)
		const [, , handler] = authCheckRegistration().args as [string, unknown, () => Promise<{ content: Array<{ type: 'text'; text: string }> }>]

		await expect(handler()).resolves.toEqual({
			content: [{ type: 'text', text: JSON.stringify({ authenticated: false }) }],
		})
		expect(close).toHaveBeenCalledOnce()
		expect(closeBrowser).toHaveBeenCalledOnce()
	})

	it('uses a refined schema that requires exactly one course selector', () => {
		const [, config] = resolutionRegistration().args as [
			string,
			{ inputSchema: z.ZodType },
		]
		const schema = config.inputSchema

		expect(schema.safeParse({}).success).toBe(false)
		expect(
			schema.safeParse({
				courseUrl: 'https://sdo.tusur.ru/course/view.php?id=20',
				courseQuery: 'physics',
			}).success,
		).toBe(false)
		expect(schema.safeParse({ courseQuery: 'physics' }).success).toBe(true)
		expect(
			schema.safeParse({
				courseUrl: 'https://sdo.tusur.ru/course/view.php?id=20',
			}).success,
		).toBe(true)
	})

	it('returns only the exact discriminated result JSON and closes owned resources', async () => {
		const close = vi.fn().mockResolvedValue(undefined)
		const closeBrowser = vi.fn().mockResolvedValue(undefined)
		const page = { kind: 'contract-page' }
		browser.getSdoPage.mockResolvedValue({
			browser: { close: closeBrowser },
			context: { close },
			page,
			authStatePresent: true,
		})
		const [, , handler] = resolutionRegistration().args as [
			string,
			unknown,
			ResolveHandler,
		]
		const expected = {
			status: 'resolved',
			course: {
				id: '20',
				name: 'Физика',
				url: 'https://sdo.tusur.ru/course/view.php?id=20',
			},
			module: {
				id: '201',
				name: 'Лекция 1',
				courseUrl: 'https://sdo.tusur.ru/course/view.php?id=20',
				activityUrl:
					'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=201',
				type: 'lecture',
			},
		}

		await expect(handler({ courseQuery: 'физика' })).resolves.toEqual({
			content: [{ type: 'text', text: JSON.stringify(expected) }],
		})
		expect(close).toHaveBeenCalledOnce()
		expect(closeBrowser).toHaveBeenCalledOnce()
	})

	it('returns auth_required without reading SDO and closes owned resources', async () => {
		const close = vi.fn().mockResolvedValue(undefined)
		const closeBrowser = vi.fn().mockResolvedValue(undefined)
		browser.getSdoPage.mockResolvedValue({
			browser: { close: closeBrowser },
			context: { close },
			page: { kind: 'empty-context-page' },
			authStatePresent: false,
		})
		const [, , handler] = resolutionRegistration().args as [
			string,
			unknown,
			ResolveHandler,
		]

		await expect(handler({ courseQuery: 'физика' })).resolves.toEqual({
			content: [
				{
					type: 'text',
					text: JSON.stringify({ status: 'auth_required' }),
				},
			],
		})
		expect(sdo.hasAuthenticatedSdoSession).not.toHaveBeenCalled()
		expect(sdo.listCourses).not.toHaveBeenCalled()
		expect(close).toHaveBeenCalledOnce()
		expect(closeBrowser).toHaveBeenCalledOnce()
	})

	it('redacts helper errors at the MCP boundary and closes owned resources', async () => {
		const close = vi.fn().mockResolvedValue(undefined)
		const closeBrowser = vi.fn().mockResolvedValue(undefined)
		browser.getSdoPage.mockResolvedValue({
			browser: { close: closeBrowser },
			context: { close },
			page: { kind: 'contract-page' },
			authStatePresent: true,
		})
		const privateDetail = 'https://bbb2.tusur.ru/b/private-room'
		sdo.hasAuthenticatedSdoSession.mockRejectedValue(
			new Error(`navigation failed at ${privateDetail}`),
		)
		const [, , handler] = resolutionRegistration().args as [
			string,
			unknown,
			ResolveHandler,
		]

		await expect(handler({ courseQuery: 'физика' })).rejects.toThrow(
			/^SDO page unavailable$/u,
		)
		expect(close).toHaveBeenCalledOnce()
		expect(closeBrowser).toHaveBeenCalledOnce()
	})

	it('redacts browser acquisition errors before a context exists', async () => {
		browser.getSdoPage.mockRejectedValue(
			new Error('browser launch failed at /private/local/auth-file'),
		)
		const [, , handler] = resolutionRegistration().args as [
			string,
			unknown,
			ResolveHandler,
		]

		await expect(handler({ courseQuery: 'физика' })).rejects.toThrow(
			/^SDO page unavailable$/u,
		)
	})
})
