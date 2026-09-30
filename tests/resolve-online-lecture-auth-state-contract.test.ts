import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

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

vi.mock('../src/sdo.js', () => ({
	downloadSdoModuleFiles: vi.fn(),
	ensureLoggedIn: vi.fn(),
	findCourseModule: vi.fn(),
	hasAuthenticatedSdoSession: vi.fn(),
	listAuthenticatedCourses: vi.fn(),
	listBbbCourseModules: vi.fn(),
	listCourseModules: vi.fn(),
	listCourses: vi.fn(),
}))

function resolveHandler(): ResolveHandler {
	const registration = mcp.registrations.find(
		({ args }) => args[0] === 'resolve_online_lecture',
	)
	if (registration === undefined) {
		throw new Error('resolve_online_lecture was not registered')
	}
	return registration.args[2] as ResolveHandler
}

describe('corrupt auth state at the MCP boundary', () => {
	let temporaryDirectory: string

	beforeAll(async () => {
		temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'sdo-auth-state-'))
		const authStatePath = path.join(temporaryDirectory, 'state.json')
		await writeFile(
			authStatePath,
			JSON.stringify({
				cookies: [
					{
						name: 'fixtureCookie',
						value: 'fixture',
						domain: '',
						path: '/',
						expires: -1,
						httpOnly: true,
						secure: true,
						sameSite: 'Lax',
					},
				],
				origins: [],
			}),
			'utf8',
		)
		vi.stubEnv('HEADLESS', 'true')
		vi.stubEnv('SDO_AUTH_STATE_PATH', authStatePath)
		await import('../src/index.js')
	})

	afterAll(async () => {
		vi.unstubAllEnvs()
		await rm(temporaryDirectory, { recursive: true, force: true })
	})

	it('returns exact auth_required JSON when Playwright rejects the state', async () => {
		await expect(resolveHandler()({ courseQuery: 'physics' })).resolves.toEqual({
			content: [
				{
					type: 'text',
					text: JSON.stringify({ status: 'auth_required' }),
				},
			],
		})
	})
})
