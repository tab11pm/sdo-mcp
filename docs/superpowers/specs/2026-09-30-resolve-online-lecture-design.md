# Resolve Online Lecture — design

## Goal

Add one SDO MCP tool that resolves a scheduled lecture to a stable Moodle
BigBlueButton activity URL. It must never guess among similar courses or
lectures, and it must not expose credentials, browser storage, or temporary
BBB join tokens.

## Boundary

SDO MCP has a short-lived responsibility: use an existing local SDO session,
find a BBB activity, return its Moodle URL, and close its browser context. The
online-lecture application owns scheduling, retries, joining BBB, monitoring,
and leaving the meeting.

Existing MCP tools remain available with their current request and response
shapes.

## MCP contract

```ts
resolve_online_lecture({
  courseUrl?: string;
  courseQuery?: string;
  lectureQuery?: string;
}): ResolveOnlineLectureResult

type ResolveOnlineLectureResult =
  | { status: 'resolved'; course: ResolvedCourse; module: OnlineLectureCandidate }
  | { status: 'ambiguous'; candidates: OnlineLectureCandidate[] }
  | { status: 'not_found' }
  | { status: 'auth_required' };

type ResolvedCourse = { id: string; name: string; url?: string };
type OnlineLectureCandidate = {
  id: string;
  name: string;
  courseUrl: string;
  activityUrl: string;
  type: 'lecture' | 'practical';
};
```

Exactly one of `courseUrl` and `courseQuery` is required. `lectureQuery` is
optional. Invalid combinations are rejected as MCP input validation errors.

`activityUrl` must be an HTTPS URL on `sdo.tusur.ru` with path
`/mod/bigbluebuttonbn/view.php` and an `id` query parameter. No response may
contain a BBB host URL, a redirect URL, a `sessionToken`, cookies, or headers.
`id` is the numeric Moodle id parsed from the URL, `courseUrl` is the canonical
course URL, and `type` is `lecture` when the activity name looks like a lecture
(the default for unclear names) or `practical` when it looks like a practical,
seminar, or lab.

## Resolution algorithm

1. Open a browser context using the auth state file named by
   `SDO_AUTH_STATE_PATH`; default to the existing local state path only for
   non-packaged development runs.
2. If that state is absent, expired, or reaches an SDO login flow, return
   `auth_required`. The tool does not perform password login.
3. Resolve the course:
   - `courseUrl`: validate it is an SDO course URL and inspect that course.
   - `courseQuery`: normalize whitespace and case, search the authenticated
     course list, and retain matching courses.
4. Read each retained course's modules, keeping only verified BBB activity
   URLs.
5. If `lectureQuery` is supplied, normalize whitespace and case and retain
   activities whose visible module name contains it. Without it, retain all
   BBB activities.
6. Return `not_found` when none remain; `resolved` when exactly one remains;
   otherwise return every retained candidate as `ambiguous`, in deterministic
   order by canonical course URL, normalized module name, then activity URL.

Neither the MCP server nor its client chooses the first candidate.

## Security and operations

- The auth-state file is local-only, outside source control, and is never
  returned, logged, or copied to diagnostics.
- `resolve_online_lecture` does not read username/password environment
  variables. Authentication is an explicit separate local setup step.
- Remove debug screenshots from the resolution/auth path. Error messages are
  redacted and describe only safe categories such as `auth_required`, timeout,
  or unavailable page.
- Every path closes the page context and browser; no background Chromium
  process may survive a tool call.
- A bounded timeout applies to navigation and module extraction. Timeout or
  unavailable SDO produces a safe MCP error, distinct from `not_found`.

## Implementation shape

- `src/sdo.ts`: pure-ish extraction and resolution helpers, accepting the
  existing Playwright `Page` and returning typed domain values.
- `src/browser.ts`: create a context from `SDO_AUTH_STATE_PATH`, and expose a
  typed auth-state outcome without automatic password login.
- `src/index.ts`: register `resolve_online_lecture` with Zod input validation,
  call the helpers, encode the discriminated result as MCP text JSON, and
  close resources in `finally`.
- `tests/`: fixture-backed unit and MCP contract tests. No real university
  pages, cookies, login data, or session storage are committed.

## Acceptance tests

1. A direct course URL with one BBB activity resolves to its Moodle activity
   URL.
2. Course query finds one course and lecture query finds one BBB activity.
3. Multiple matching courses or activities return all candidates as
   `ambiguous`; no candidate is selected.
4. No matching course or BBB activity returns `not_found`.
5. Missing, expired, or login-redirected auth state returns `auth_required`.
6. Non-BBB Moodle modules and malformed/off-domain activity links are ignored.
7. Invalid input combinations fail validation.
8. Responses, errors, and fixtures contain no passwords, cookies,
   `sessionToken`s, or temporary BBB URLs.
9. Browser/context cleanup occurs after every outcome, including timeout and
   parsing failure.
