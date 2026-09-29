export interface CourseRef {
	name: string
	url: string
}

export interface BbbModuleRef {
	name: string
	activityUrl: string
}

export interface LectureCandidate {
	course: CourseRef
	module: BbbModuleRef
}

export type ResolveOnlineLectureResult =
	| { status: 'resolved'; course: CourseRef; module: BbbModuleRef }
	| { status: 'ambiguous'; candidates: LectureCandidate[] }
	| { status: 'not_found'; candidates: [] }
	| { status: 'auth_required' }

export type ModulesByCourse = Readonly<
	Record<string, readonly BbbModuleRef[]>
>

export function normalizeSearchText(value: string): string {
	return value.toLowerCase().trim().replace(/\s+/gu, ' ')
}

const SDO_ORIGIN = 'https://sdo.tusur.ru'

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

export function isSdoCourseUrl(value: string): boolean {
	return canonicalizeSdoUrl(value, '/course/view.php') !== undefined
}

export function isStableBbbActivityUrl(value: string): boolean {
	return (
		canonicalizeSdoUrl(value, '/mod/bigbluebuttonbn/view.php') !==
		undefined
	)
}

function compareText(left: string, right: string): number {
	if (left < right) return -1
	if (left > right) return 1
	return 0
}

function compareCandidates(
	left: LectureCandidate,
	right: LectureCandidate,
): number {
	return (
		compareText(
			normalizeSearchText(left.course.name),
			normalizeSearchText(right.course.name),
		) ||
		compareText(
			normalizeSearchText(left.module.name),
			normalizeSearchText(right.module.name),
		) ||
		compareText(left.module.activityUrl, right.module.activityUrl)
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
	const candidates: LectureCandidate[] = []

	for (const course of courses) {
		const canonicalCourseUrl = canonicalizeSdoUrl(
			course.url,
			'/course/view.php',
		)
		if (canonicalCourseUrl === undefined) continue

		const canonicalCourse: CourseRef = {
			name: course.name,
			url: canonicalCourseUrl,
		}

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

			candidates.push({
				course: canonicalCourse,
				module: {
					name: module.name,
					activityUrl: canonicalActivityUrl,
				},
			})
		}
	}

	candidates.sort(compareCandidates)

	if (candidates.length === 0) {
		return { status: 'not_found', candidates: [] }
	}

	if (candidates.length === 1) {
		const candidate = candidates[0]!
		return {
			status: 'resolved',
			course: candidate.course,
			module: candidate.module,
		}
	}

	return { status: 'ambiguous', candidates }
}
