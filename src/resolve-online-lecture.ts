import type { Page } from 'playwright'

import {
	chooseLectureCandidates,
	isSdoCourseUrl,
	normalizeSearchText,
	type CourseRef,
	type ModulesByCourse,
	type ResolveOnlineLectureResult,
} from './lecture-resolution.js'
import {
	hasAuthenticatedSdoSession,
	listBbbCourseModules,
	listCourses,
} from './sdo.js'

export interface ResolveOnlineLectureInput {
	courseUrl?: string
	courseQuery?: string
	lectureQuery?: string
}

function validateInput(input: ResolveOnlineLectureInput): void {
	const selectorCount =
		Number(input.courseUrl !== undefined) +
		Number(input.courseQuery !== undefined)

	if (selectorCount !== 1) {
		throw new Error('Expected exactly one course selector')
	}

	if (
		input.courseUrl !== undefined &&
		!isSdoCourseUrl(input.courseUrl)
	) {
		throw new Error('Invalid SDO course URL')
	}

	if (
		input.courseQuery !== undefined &&
		normalizeSearchText(input.courseQuery) === ''
	) {
		throw new Error('Course query must not be empty')
	}

	if (
		input.lectureQuery !== undefined &&
		normalizeSearchText(input.lectureQuery) === ''
	) {
		throw new Error('Lecture query must not be empty')
	}
}

function selectCourses(
	courses: readonly { title: string; url: string }[],
	courseQuery: string,
): CourseRef[] {
	const normalizedQuery = normalizeSearchText(courseQuery)
	const selected = new Map<string, CourseRef>()

	for (const course of courses) {
		if (!course.title || !isSdoCourseUrl(course.url)) continue

		const normalizedUrl = new URL(course.url).href
		const matches = normalizeSearchText(course.title).includes(normalizedQuery)

		if (matches && !selected.has(normalizedUrl)) {
			selected.set(normalizedUrl, {
				name: course.title,
				url: normalizedUrl,
			})
		}
	}

	return [...selected.values()]
}

export async function resolveOnlineLecture(
	page: Page,
	input: ResolveOnlineLectureInput,
): Promise<ResolveOnlineLectureResult> {
	validateInput(input)

	if (!(await hasAuthenticatedSdoSession(page))) {
		return { status: 'auth_required' }
	}

	const courses =
		input.courseUrl === undefined
			? selectCourses(await listCourses(page), input.courseQuery!)
			: [
					{
						name: new URL(input.courseUrl).href,
						url: new URL(input.courseUrl).href,
					},
				]
	const modulesByCourse: Record<
		string,
		ModulesByCourse[string]
	> = {}

	for (const course of courses) {
		modulesByCourse[course.url] = await listBbbCourseModules(page, course.url)
	}

	return chooseLectureCandidates(
		courses,
		modulesByCourse,
		input.lectureQuery,
	)
}
