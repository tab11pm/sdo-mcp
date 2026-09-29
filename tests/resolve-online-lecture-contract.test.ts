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

describe('resolve_online_lecture MCP boundary', () => {
	beforeAll(async () => {
		await import('../src/index.js')
	})

	beforeEach(() => {
		vi.clearAllMocks()
		sdo.hasAuthenticatedSdoSession.mockResolvedValue(true)
		sdo.listCourses.mockResolvedValue([
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

	it('returns only the exact discriminated result JSON and closes its context', async () => {
		const close = vi.fn().mockResolvedValue(undefined)
		const page = { kind: 'contract-page' }
		browser.getSdoPage.mockResolvedValue({
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
				name: 'Физика',
				url: 'https://sdo.tusur.ru/course/view.php?id=20',
			},
			module: {
				name: 'Лекция 1',
				activityUrl:
					'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=201',
			},
		}

		await expect(handler({ courseQuery: 'физика' })).resolves.toEqual({
			content: [{ type: 'text', text: JSON.stringify(expected) }],
		})
		expect(close).toHaveBeenCalledOnce()
	})
})
