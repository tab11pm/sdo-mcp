import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdo = vi.hoisted(() => ({
	hasAuthenticatedSdoSession: vi.fn(),
	listAuthenticatedCourses: vi.fn(),
	listCourses: vi.fn(),
	listBbbCourseModules: vi.fn(),
}))

vi.mock('../src/sdo.js', () => sdo)

import { resolveOnlineLecture } from '../src/resolve-online-lecture.js'

const page = { kind: 'local-page-double' }

const algebraCourse = {
	title: 'Линейная алгебра',
	url: 'https://sdo.tusur.ru/course/view.php?id=10',
}
const physicsCourse = {
	title: ' Общая   ФИЗИКА ',
	url: 'https://sdo.tusur.ru/course/view.php?id=20',
}

describe('resolveOnlineLecture', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		sdo.hasAuthenticatedSdoSession.mockResolvedValue(true)
		sdo.listAuthenticatedCourses.mockResolvedValue([
			algebraCourse,
			physicsCourse,
		])
		sdo.listBbbCourseModules.mockResolvedValue([])
	})

	it.each([
		{},
		{
			courseUrl: algebraCourse.url,
			courseQuery: 'алгебра',
		},
	])('rejects input that does not contain exactly one course selector', async (input) => {
		await expect(
			resolveOnlineLecture(page as never, input),
		).rejects.toThrow('exactly one course selector')
	})

	it('returns auth_required before reading the course list', async () => {
		sdo.hasAuthenticatedSdoSession.mockResolvedValue(false)

		await expect(
			resolveOnlineLecture(page as never, { courseQuery: 'physics' }),
		).resolves.toEqual({ status: 'auth_required' })
		expect(sdo.listCourses).not.toHaveBeenCalled()
		expect(sdo.listBbbCourseModules).not.toHaveBeenCalled()
	})

	it('resolves one BBB activity selected by a direct course URL', async () => {
		sdo.listBbbCourseModules.mockResolvedValue([
		{
			name: 'Лекция 1',
			activityUrl:
				'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=101',
		},
	])

		await expect(
			resolveOnlineLecture(page as never, {
				courseUrl: algebraCourse.url,
			}),
		).resolves.toEqual({
			status: 'resolved',
			course: { name: algebraCourse.url, url: algebraCourse.url },
			module: {
				name: 'Лекция 1',
				activityUrl:
					'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=101',
			},
		})
	})

	it('inspects a direct course URL without reading the landing-page course list', async () => {
		sdo.listAuthenticatedCourses.mockRejectedValue(
			new Error('authenticated course list unavailable'),
		)
		sdo.listCourses.mockRejectedValue(
			new Error('landing-page course list unavailable'),
		)
		sdo.listBbbCourseModules.mockResolvedValue([
			{
				name: 'Лекция 1',
				activityUrl:
					'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=101',
			},
		])

		await expect(
			resolveOnlineLecture(page as never, {
				courseUrl: algebraCourse.url,
			}),
		).resolves.toEqual({
			status: 'resolved',
			course: { name: algebraCourse.url, url: algebraCourse.url },
			module: {
				name: 'Лекция 1',
				activityUrl:
					'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=101',
			},
		})
		expect(sdo.listAuthenticatedCourses).not.toHaveBeenCalled()
		expect(sdo.listCourses).not.toHaveBeenCalled()
	})

	it('normalizes a course query and lecture query before matching', async () => {
		sdo.listBbbCourseModules.mockResolvedValue([
		{
			name: ' ЛЕКЦИЯ   ДВА ',
			activityUrl:
				'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=202',
		},
	])

		await expect(
			resolveOnlineLecture(page as never, {
				courseQuery: '  общая физика ',
				lectureQuery: 'лекция два',
			}),
		).resolves.toEqual({
			status: 'resolved',
			course: { name: physicsCourse.title, url: physicsCourse.url },
			module: {
				name: ' ЛЕКЦИЯ   ДВА ',
				activityUrl:
					'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=202',
			},
		})
	})

	it('returns not_found when no course matches the query', async () => {
		await expect(
			resolveOnlineLecture(page as never, { courseQuery: 'геометрия' }),
		).resolves.toEqual({ status: 'not_found', candidates: [] })
		expect(sdo.listBbbCourseModules).not.toHaveBeenCalled()
	})

	it('returns matching lectures from multiple courses as ambiguous', async () => {
		sdo.listAuthenticatedCourses.mockResolvedValue([
			{ title: 'Физика — ИРЭТ', url: algebraCourse.url },
			{ title: 'Физика — ФСУ', url: physicsCourse.url },
		])
		sdo.listBbbCourseModules.mockImplementation(
			async (_page: unknown, courseUrl: string) => [
				{
					name: 'Основная лекция',
					activityUrl: `https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=${courseUrl.endsWith('10') ? '101' : '201'}`,
				},
			],
		)

		await expect(
			resolveOnlineLecture(page as never, { courseQuery: 'физика' }),
		).resolves.toEqual({
			status: 'ambiguous',
			candidates: [
				{
					course: { name: 'Физика — ИРЭТ', url: algebraCourse.url },
					module: {
						name: 'Основная лекция',
						activityUrl:
							'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=101',
					},
				},
				{
					course: { name: 'Физика — ФСУ', url: physicsCourse.url },
					module: {
						name: 'Основная лекция',
						activityUrl:
							'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=201',
					},
				},
			],
		})
	})

	it('returns multiple matching activities in one course as ambiguous', async () => {
		sdo.listBbbCourseModules.mockResolvedValue([
		{
			name: 'Лекция 2',
			activityUrl:
				'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=102',
		},
		{
			name: 'Лекция 1',
			activityUrl:
				'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=101',
		},
	])

		const result = await resolveOnlineLecture(page as never, {
			courseUrl: algebraCourse.url,
			lectureQuery: 'лекция',
		})

		expect(result.status).toBe('ambiguous')
		if (result.status === 'ambiguous') {
			expect(result.candidates.map(({ module }) => module.name)).toEqual([
				'Лекция 1',
				'Лекция 2',
			])
		}
	})
})
