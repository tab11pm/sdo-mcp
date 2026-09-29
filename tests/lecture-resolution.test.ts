import { describe, expect, it } from 'vitest'

import {
	chooseLectureCandidates,
	isSdoCourseUrl,
	isStableBbbActivityUrl,
	normalizeSearchText,
	type BbbModuleRef,
	type CourseRef,
	type ModulesByCourse,
} from '../src/lecture-resolution.js'

describe('normalizeSearchText', () => {
	it('lowercases Unicode text and collapses surrounding whitespace', () => {
		expect(normalizeSearchText('\u00a0 ЛЕКЦИЯ\n\t  Один \u00a0')).toBe(
			'лекция один',
		)
	})
})

describe('isSdoCourseUrl', () => {
	it.each([
		'https://sdo.tusur.ru/course/view.php?id=10',
		'https://sdo.tusur.ru/course/view.php?id=physics',
		'https://sdo.tusur.ru/course/view.php?id=10&section=2',
	])('accepts an HTTPS SDO course URL with an id: %s', (value) => {
		expect(isSdoCourseUrl(value)).toBe(true)
	})

	it.each([
		'http://sdo.tusur.ru/course/view.php?id=10',
		'https://example.invalid/course/view.php?id=10',
		'https://sdo.tusur.ru/course/index.php?id=10',
		'https://sdo.tusur.ru/course/view.php',
		'https://sdo.tusur.ru/course/view.php?id=10&sessionToken=x',
		'https://user:secret@sdo.tusur.ru/course/view.php?id=10',
		'not-a-url',
	])('rejects a URL outside the SDO course boundary: %s', (value) => {
		expect(isSdoCourseUrl(value)).toBe(false)
	})
})

describe('isStableBbbActivityUrl', () => {
	it('accepts a stable Moodle BBB activity URL', () => {
		expect(
			isStableBbbActivityUrl(
				'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=17',
			),
		).toBe(true)
	})

	it('accepts a stable activity URL with a benign Moodle query parameter', () => {
		expect(
			isStableBbbActivityUrl(
				'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=17&forceview=1',
			),
		).toBe(true)
	})

	it.each([
		'https://bbb2.tusur.ru/b/secret?sessionToken=x',
		'http://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=17',
		'https://example.invalid/mod/bigbluebuttonbn/view.php?id=17',
		'https://sdo.tusur.ru/mod/bigbluebuttonbn/index.php?id=17',
		'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php',
		'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=17&sessionToken=x',
		'https://user:secret@sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=17',
		'not-a-url',
	])('rejects a non-stable BBB activity URL: %s', (value) => {
		expect(isStableBbbActivityUrl(value)).toBe(false)
	})
})

describe('chooseLectureCandidates', () => {
	const courses: CourseRef[] = [
		{
			name: ' Физика ',
			url: 'https://sdo.tusur.ru/course/view.php?id=20',
		},
		{
			name: 'Алгебра',
			url: 'https://sdo.tusur.ru/course/view.php?id=10',
		},
	]

	const modulesByCourse: Readonly<Record<string, readonly BbbModuleRef[]>> = {
		'https://sdo.tusur.ru/course/view.php?id=20': [
			{
				name: 'Лекция 1 — Введение',
				activityUrl:
					'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=201',
			},
		],
		'https://sdo.tusur.ru/course/view.php?id=10': [
			{
				name: '   ЛЕКЦИЯ   1   — Матрицы ',
				activityUrl:
					'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=101',
			},
			{
				name: 'Лекция 2',
				activityUrl:
					'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=102',
			},
			{
				name: 'Temporary room',
				activityUrl: 'https://bbb2.tusur.ru/b/temporary-room',
			},
		],
	}

	it('returns one validated candidate as resolved', () => {
		expect(chooseLectureCandidates(courses, modulesByCourse, 'лекция 2')).toEqual(
			{
				status: 'resolved',
				course: courses[1],
				module: modulesByCourse[courses[1]!.url]![1],
			},
		)
	})

	it('returns not_found when no validated module matches', () => {
		expect(
			chooseLectureCandidates(courses, modulesByCourse, 'семинар'),
		).toEqual({ status: 'not_found', candidates: [] })
	})

	it('returns every match in deterministic course, module, then URL order', () => {
		expect(
			chooseLectureCandidates(courses, modulesByCourse, 'лекция 1'),
		).toEqual({
			status: 'ambiguous',
			candidates: [
				{
					course: courses[1],
					module: modulesByCourse[courses[1]!.url]![0],
				},
				{
					course: courses[0],
					module: modulesByCourse[courses[0]!.url]![0],
				},
			],
		})
	})

	it('filters invalid activity URLs when no lecture query is supplied', () => {
		expect(chooseLectureCandidates([courses[0]!], modulesByCourse)).toEqual({
			status: 'resolved',
			course: courses[0],
			module: modulesByCourse[courses[0]!.url]![0],
		})
	})

	it('uses activity URL as the final deterministic sort key', () => {
		const course = courses[1]!
		const sameNamedModules: ModulesByCourse = {
			[course.url]: [
				{
					name: 'Лекция',
					activityUrl:
						'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=2',
				},
				{
					name: ' лекция ',
					activityUrl:
						'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
				},
			],
		}

		expect(chooseLectureCandidates([course], sameNamedModules)).toEqual({
			status: 'ambiguous',
			candidates: [
				{ course, module: sameNamedModules[course.url]![1] },
				{ course, module: sameNamedModules[course.url]![0] },
			],
		})
	})
})
