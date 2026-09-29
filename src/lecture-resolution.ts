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

function parseSdoUrl(value: string, pathname: string): URL | undefined {
	try {
		const url = new URL(value)

		if (
			url.protocol !== 'https:' ||
			url.hostname !== 'sdo.tusur.ru' ||
			url.port !== '' ||
			url.username !== '' ||
			url.password !== '' ||
			url.pathname !== pathname ||
			url.hash !== '' ||
			!url.searchParams.get('id')
		) {
			return undefined
		}

		return url
	} catch {
		return undefined
	}
}

function hasSessionToken(url: URL): boolean {
	return [...url.searchParams.keys()].some(
		(key) => key.toLowerCase() === 'sessiontoken',
	)
}

export function isSdoCourseUrl(value: string): boolean {
	const url = parseSdoUrl(value, '/course/view.php')
	return url !== undefined && !hasSessionToken(url)
}

export function isStableBbbActivityUrl(value: string): boolean {
	const url = parseSdoUrl(value, '/mod/bigbluebuttonbn/view.php')
	return url !== undefined && !hasSessionToken(url)
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
		for (const module of modulesByCourse[course.url] ?? []) {
			if (!isStableBbbActivityUrl(module.activityUrl)) continue
			if (
				normalizedQuery !== undefined &&
				!normalizeSearchText(module.name).includes(normalizedQuery)
			) {
				continue
			}

			candidates.push({ course, module })
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
