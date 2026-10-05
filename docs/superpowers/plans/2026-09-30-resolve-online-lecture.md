# Resolve Online Lecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe SDO MCP tool that resolves an unambiguous Moodle BBB activity for a selected course and otherwise returns an explicit outcome.

**Architecture:** Keep matching and URL validation independent of Playwright in `src/lecture-resolution.ts`. Extend browser setup with an auth-state-only outcome, then use it from a narrow MCP handler in `src/index.ts`. Preserve the five existing tools and their contracts.

**Tech Stack:** TypeScript (NodeNext), MCP SDK, Zod, Playwright, Vitest with static HTML fixtures.

## Global Constraints

- Accept exactly one of `courseUrl` and `courseQuery`; `lectureQuery` is optional.
- Return only `resolved`, `ambiguous`, `not_found`, or `auth_required`; never select the first candidate.
- Return only stable HTTPS `sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=…` URLs.
- Never read or log passwords, cookies, auth state, redirect URLs, session tokens, or temporary BBB URLs.
- All fixture tests are local; no live SDO page, browser profile, or credentials enter the repository.
- All browser contexts and browsers close in a `finally` path.

---

### Task 1: Install the fixture test harness and pure resolution contract

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lecture-resolution.ts`
- Create: `tests/lecture-resolution.test.ts`
- Create: `tests/fixtures/course-list.html`
- Create: `tests/fixtures/course-modules.html`

**Interfaces:**
- Produces `CourseRef`, `BbbModuleRef`, `ResolvedCourse`, `OnlineLectureCandidate`, `ResolveOnlineLectureResult`.
- Produces `normalizeSearchText(value: string): string`, `isSdoCourseUrl(value: string): boolean`, `isStableBbbActivityUrl(value: string): boolean`, and `chooseLectureCandidates(courses, modulesByCourse, lectureQuery?)`.

- [ ] **Step 1: Write failing contract tests**

```ts
expect(isStableBbbActivityUrl('https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=17')).toBe(true)
expect(isStableBbbActivityUrl('https://bbb2.tusur.ru/b/secret?sessionToken=x')).toBe(false)
expect(chooseLectureCandidates(courses, modules, 'лекция 1')).toEqual({
  status: 'ambiguous', candidates: [/* both deterministic candidates */],
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lecture-resolution`

Expected: failure because the test script and resolution module do not exist.

- [ ] **Step 3: Add Vitest and minimal deterministic helpers**

Add scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Implement the functions so comparisons are Unicode lowercase, whitespace-collapsed substring matches; candidates are sorted by canonical course URL, normalized module title, then activity URL; activity `id`/`courseUrl` are derived from the canonical URLs and `type` is classified from the module name (default `lecture`); and only validated BBB URLs survive.

- [ ] **Step 4: Run unit suite**

Run: `npm test -- lecture-resolution`

Expected: PASS for URL validation, one result, no result, and multiple deterministic results.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lecture-resolution.ts tests/lecture-resolution.test.ts tests/fixtures
git commit -m "test: add lecture resolution contract"
```

### Task 2: Extract BBB modules and provide auth-state-only browser access

**Files:**
- Modify: `src/browser.ts`
- Modify: `src/sdo.ts`
- Create: `tests/browser-auth-state.test.ts`
- Create: `tests/sdo-bbb-modules.test.ts`

**Interfaces:**
- Consumes `isStableBbbActivityUrl`.
- Produces `getSdoPage(): Promise<{ context; page; authStatePresent: boolean }>` using `SDO_AUTH_STATE_PATH` when provided.
- Produces `hasAuthenticatedSdoSession(page): Promise<boolean>` and `listBbbCourseModules(page, courseUrl): Promise<BbbModuleRef[]>`.

- [ ] **Step 1: Write failing tests**

```ts
expect(resolveAuthStatePath({ SDO_AUTH_STATE_PATH: '/tmp/state.json' })).toBe('/tmp/state.json')
expect(extractBbbModules(anchors)).toEqual([
  { name: 'Лекция 1', activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=17' },
])
```

Cover missing auth state, login-page detection, a BBB link, duplicate BBB links, resource/assign links, and an off-domain BBB-looking link.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- browser-auth-state sdo-bbb-modules`

Expected: FAIL because the extraction and auth-only APIs are absent.

- [ ] **Step 3: Implement bounded auth-only helpers**

`getSdoPage` reads only `SDO_AUTH_STATE_PATH` (or the documented development default), opens a context with that state when it exists, and returns `authStatePresent`. Remove automatic credential login and debug screenshots from the new resolution path. `hasAuthenticatedSdoSession` returns false on a login route/form. `listBbbCourseModules` reads anchors, validates stable activity URLs, de-duplicates by URL, and returns only `{ name, activityUrl }`.

- [ ] **Step 4: Run focused tests and build**

Run: `npm test -- browser-auth-state sdo-bbb-modules && npm run build`

Expected: PASS; browser behavior is tested with mocks, not network access.

- [ ] **Step 5: Commit**

```bash
git add src/browser.ts src/sdo.ts tests/browser-auth-state.test.ts tests/sdo-bbb-modules.test.ts
git commit -m "feat: expose safe BBB module discovery"
```

### Task 3: Register `resolve_online_lecture` and test its MCP boundary

**Files:**
- Modify: `src/index.ts`
- Create: `src/resolve-online-lecture.ts`
- Create: `tests/resolve-online-lecture.test.ts`
- Create: `tests/resolve-online-lecture-contract.test.ts`

**Interfaces:**
- Consumes `CourseRef`, `OnlineLectureCandidate`, `ResolveOnlineLectureResult`, `hasAuthenticatedSdoSession`, `listCourses`, `listBbbCourseModules`, and `chooseLectureCandidates`.
- Produces `resolveOnlineLecture(page, input): Promise<ResolveOnlineLectureResult>`.

- [ ] **Step 1: Write failing service and MCP-schema tests**

```ts
await expect(resolveOnlineLecture(page, {
  courseUrl: 'https://sdo.tusur.ru/course/view.php?id=10',
  courseQuery: 'physics',
})).rejects.toThrow()

expect(await resolveOnlineLecture(loginPage, { courseQuery: 'physics' }))
  .toEqual({ status: 'auth_required' })
```

Test direct URL resolution, course-query resolution, `not_found`, ambiguous
courses, ambiguous lectures, missing auth, input exclusivity, and exact JSON
without sensitive keys.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- resolve-online-lecture`

Expected: FAIL because the service and registered tool do not exist.

- [ ] **Step 3: Implement service and MCP handler**

Use a Zod schema refined to require exactly one course selector. In the tool handler, open one context, return `{ status: 'auth_required' }` before course reads when no authenticated session exists, encode only the discriminated result with `JSON.stringify`, and close the context in `finally`. Retain all existing `server.tool` definitions unchanged.

- [ ] **Step 4: Run contract suite, build, and secret scan**

Run: `npm test && npm run build && rg -n 'sessionToken|storageState|SDO_PASSWORD|SDO_USERNAME' src tests`

Expected: tests/build PASS; the scan finds no password access or sensitive output in the new resolution code and fixtures.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/resolve-online-lecture.ts tests/resolve-online-lecture.test.ts tests/resolve-online-lecture-contract.test.ts
git commit -m "feat: resolve Moodle BBB lectures"
```

### Task 4: Document safe setup and verify cleanup behavior

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`
- Create: `tests/resolve-online-lecture-cleanup.test.ts`

**Interfaces:**
- Consumes the registered MCP tool from Task 3.
- Produces local setup instructions using `SDO_AUTH_STATE_PATH`, with no credentials or sample secrets.

- [ ] **Step 1: Write failing cleanup test**

```ts
await expect(invokeToolWithThrowingModuleRead()).rejects.toThrow('SDO unavailable')
expect(context.close).toHaveBeenCalledOnce()
```

Also assert context closure for `resolved`, `ambiguous`, `not_found`, and `auth_required`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- resolve-online-lecture-cleanup`

Expected: FAIL until all early-return paths share a `finally` close.

- [ ] **Step 3: Update docs and ignore rules**

Document the one-time manual auth-state creation, `SDO_AUTH_STATE_PATH`, the input/result contract, and the no-auto-choice behavior. Ignore auth state, Playwright profiles, screenshots, downloads, and diagnostics. Remove any credential examples from documentation touched by this work.

- [ ] **Step 4: Run final verification**

Run: `npm test && npm run build && git diff --check && git status --short`

Expected: all tests and compilation pass; no auth state, screenshots, databases, or credentials are tracked.

- [ ] **Step 5: Commit**

```bash
git add README.md .gitignore tests/resolve-online-lecture-cleanup.test.ts
git commit -m "docs: describe safe lecture resolution setup"
```

## Plan self-review

- Coverage: Tasks 1–3 implement the contract and matching rules; Task 2 covers auth state and BBB extraction; Task 4 covers resource cleanup, docs, and ignored secret-bearing artifacts.
- No-placeholder check: all tasks list exact files, interfaces, commands, expected outcomes, and commit boundaries.
- Type consistency: `CourseRef`, `BbbModuleRef`, `ResolvedCourse`, `OnlineLectureCandidate`, and `ResolveOnlineLectureResult` originate in Task 1 and are consumed unchanged by later tasks.
