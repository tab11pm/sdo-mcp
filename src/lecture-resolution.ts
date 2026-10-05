export interface CourseRef {
	name: string
	url: string
}

export interface BbbModuleRef {
	name: string
	activityUrl: string
}

export interface ResolvedCourse {
	id: string
	name: string
	url?: string
}

export interface OnlineLectureCandidate {
	id: string
	name: string
	courseUrl: string
	activityUrl: string
	type: 'lecture' | 'practical'
}

export type ResolveOnlineLectureResult =
	| { status: 'resolved'; course: ResolvedCourse; module: OnlineLectureCandidate }
	| { status: 'ambiguous'; candidates: OnlineLectureCandidate[] }
	| { status: 'not_found' }
	| { status: 'auth_required' }

export type ModulesByCourse = Readonly<
	Record<string, readonly BbbModuleRef[]>
>

export function normalizeSearchText(value: string): string {
	return value.toLowerCase().trim().replace(/\s+/gu, ' ')
}

const SDO_ORIGIN = 'https://sdo.tusur.ru'

const LECTURE_TYPE_HINTS = [
	'лекц',
	'lecture',
	'онлайн',
	'online',
	'вебинар',
	'webinar',
]

const PRACTICAL_TYPE_HINTS = [
	'практи',
	'practic',
	'семинар',
	'seminar',
	'лаборатор',
	'lab',
]

function canonicalizeSdoUrl(
	value: string,
	pathname: string,
): string | undefined {
	try {
		const url = new URL(value)
		const queryKeys = [...url.searchParams.keys()]
		const ids = url.searchParams.getAll('id')

		if (
			url.protocol !== 'https:' ||
			url.hostname !== 'sdo.tusur.ru' ||
			url.port !== '' ||
			url.username !== '' ||
			url.password !== '' ||
			url.pathname !== pathname ||
			url.hash !== '' ||
			queryKeys.length !== 1 ||
			queryKeys[0] !== 'id' ||
			ids.length !== 1 ||
			!/^[1-9]\d*$/u.test(ids[0] ?? '')
		) {
			return undefined
		}

		return `${SDO_ORIGIN}${pathname}?id=${ids[0]}`
	} catch {
		return undefined
	}
}

function idFromCanonicalSdoUrl(value: string): string {
	return new URL(value).searchParams.get('id') ?? ''
}

export function isSdoCourseUrl(value: string): boolean {
	return canonicalizeSdoUrl(value, '/course/view.php') !== undefined
}

export function isStableBbbActivityUrl(value: string): boolean {
	return (
		canonicalizeSdoUrl(value, '/mod/bigbluebuttonbn/view.php') !==
		undefined
	)
}

export function classifyOnlineLectureType(
	name: string,
): 'lecture' | 'practical' {
	const normalized = normalizeSearchText(name)

	if (LECTURE_TYPE_HINTS.some((hint) => normalized.includes(hint))) {
		return 'lecture'
	}
	if (PRACTICAL_TYPE_HINTS.some((hint) => normalized.includes(hint))) {
		return 'practical'
	}

	return 'lecture'
}

function compareText(left: string, right: string): number {
	if (left < right) return -1
	if (left > right) return 1
	return 0
}

function compareCandidates(
	left: OnlineLectureCandidate,
	right: OnlineLectureCandidate,
): number {
	return (
		compareText(left.courseUrl, right.courseUrl) ||
		compareText(
			normalizeSearchText(left.name),
			normalizeSearchText(right.name),
		) ||
		compareText(left.activityUrl, right.activityUrl)
	)
}

export function chooseLectureCandidates(
	courses: readonly CourseRef[],
	modulesByCourse: ModulesByCourse,
	lectureQuery?: string,
): ResolveOnlineLectureResult {
	const normalizedQuery =
		lectureQuery === undefined
			? undefined
			: normalizeSearchText(lectureQuery)
	let resolvedCourse: ResolvedCourse | undefined
	const candidates: OnlineLectureCandidate[] = []

	for (const course of courses) {
		const canonicalCourseUrl = canonicalizeSdoUrl(
			course.url,
			'/course/view.php',
		)
		if (canonicalCourseUrl === undefined) continue

		const courseCandidates: OnlineLectureCandidate[] = []

		for (const module of modulesByCourse[course.url] ?? []) {
			const canonicalActivityUrl = canonicalizeSdoUrl(
				module.activityUrl,
				'/mod/bigbluebuttonbn/view.php',
			)
			if (canonicalActivityUrl === undefined) continue
			if (
				normalizedQuery !== undefined &&
				!normalizeSearchText(module.name).includes(normalizedQuery)
			) {
				continue
			}

			courseCandidates.push({
				id: idFromCanonicalSdoUrl(canonicalActivityUrl),
				name: module.name,
				courseUrl: canonicalCourseUrl,
				activityUrl: canonicalActivityUrl,
				type: classifyOnlineLectureType(module.name),
			})
		}

		if (courseCandidates.length > 0 && resolvedCourse === undefined) {
			resolvedCourse = {
				id: idFromCanonicalSdoUrl(canonicalCourseUrl),
				name: course.name,
				url: canonicalCourseUrl,
			}
		}

		candidates.push(...courseCandidates)
	}

	candidates.sort(compareCandidates)

	if (candidates.length === 0) {
		return { status: 'not_found' }
	}

	if (candidates.length === 1) {
		return {
			status: 'resolved',
			course: resolvedCourse!,
			module: candidates[0]!,
		}
	}

	return { status: 'ambiguous', candidates }
}
