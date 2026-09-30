import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface Registration {
	args: unknown[]
}

type ResolveHandler = (input: {
	courseUrl?: string
	courseQuery?: string
	lectureQuery?: string
}) => Promise<{ content: Array<{ type: 'text'; text: string }> }>

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
			mcp.registrations.push({ args })
		}

		registerTool(...args: unknown[]) {
			mcp.registrations.push({ args })
		}

		connect = mcp.connect
	},
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
	StdioServerTransport: class {},
}))

vi.mock('../src/browser.js', () => browser)
vi.mock('../src/sdo.js', () => sdo)

function resolveHandler(): ResolveHandler {
	const registration = mcp.registrations.find(
		({ args }) => args[0] === 'resolve_online_lecture',
	)
	if (registration === undefined) {
		throw new Error('resolve_online_lecture was not registered')
	}

	return registration.args[2] as ResolveHandler
}

const courseUrl = 'https://sdo.tusur.ru/course/view.php?id=20'

describe('resolve_online_lecture context cleanup', () => {
	beforeAll(async () => {
		await import('../src/index.js')
	})

	beforeEach(() => {
		vi.clearAllMocks()
		sdo.hasAuthenticatedSdoSession.mockResolvedValue(true)
		sdo.listBbbCourseModules.mockResolvedValue([])
	})

	it.each([
		{
			status: 'resolved',
			authStatePresent: true,
			modules: [
				{
					name: 'Лекция 1',
					activityUrl:
						'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=201',
				},
			],
		},
		{
			status: 'ambiguous',
			authStatePresent: true,
			modules: [
				{
					name: 'Лекция 1',
					activityUrl:
						'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=201',
				},
				{
					name: 'Лекция 2',
					activityUrl:
						'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=202',
				},
			],
		},
		{
			status: 'not_found',
			authStatePresent: true,
			modules: [],
		},
		{
			status: 'auth_required',
			authStatePresent: false,
			modules: [],
		},
	])('closes its context after returning $status', async ({
		status,
		authStatePresent,
		modules,
	}) => {
		const close = vi.fn().mockResolvedValue(undefined)
		browser.getSdoPage.mockResolvedValue({
			context: { close },
			page: { kind: `${status}-page` },
			authStatePresent,
		})
		sdo.listBbbCourseModules.mockResolvedValue(modules)

		const response = await resolveHandler()({ courseUrl })

		expect(JSON.parse(response.content[0]!.text)).toMatchObject({ status })
		expect(close).toHaveBeenCalledOnce()
	})

	it('closes its context when reading course modules fails', async () => {
		const close = vi.fn().mockResolvedValue(undefined)
		browser.getSdoPage.mockResolvedValue({
			context: { close },
			page: { kind: 'module-read-error-page' },
			authStatePresent: true,
		})
		sdo.listBbbCourseModules.mockRejectedValue(
			new Error('private module read details'),
		)

		await expect(resolveHandler()({ courseUrl })).rejects.toThrow(
			'SDO page unavailable',
		)
		expect(close).toHaveBeenCalledOnce()
	})
})
