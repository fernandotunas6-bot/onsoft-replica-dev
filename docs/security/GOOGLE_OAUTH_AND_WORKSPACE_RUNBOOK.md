# SIGA Plus — Google sign-in vs Google Workspace

## Identity: one authority (Supabase Auth)

- Primary origin: `https://portal-siga.com`.
- Supabase ref: `xodgfmxiaunpamctfeea`.
- Google web client authorized redirect: `https://xodgfmxiaunpamctfeea.supabase.co/auth/v1/callback`.
- Supabase Site URL: `https://portal-siga.com`.
- Supabase Redirect URL: `https://portal-siga.com` (add exact verified app origins separately).
- The SIGA button uses `supabase.auth.signInWithOAuth({provider:"google"})`.
- The Google web client secret lives ONLY in the Google provider settings on Supabase.
- Rotate the Google secret previously shared in conversation. Never commit it, print it or put it in public Vite environment variables.
- Request only `openid`, `email`, `profile` for sign-in. No Gmail, Calendar or Drive scopes.

## Authorization: always check the SIGA server

The `AuthGate` fails closed on initial/restored sessions, sign-in, refresh, profile changes and when the browser tab returns from the background. It calls `verifyInstitutionalAccessFn`. A user needs a *current* `school_memberships.status='active'` **and an active corresponding school** (`schools.status='active'`), or an entry in `platform_admins`. Both are server-owned database records and are checked using a server-only administrative client. Never trust Google `email`, `user_metadata`, browser `sessionStorage`, the current route or a locally remembered role for authorization. Data APIs must separately enforce institution-scoped RLS and permission checks.

**Never automatically delete `auth.users` when membership verification fails.** A person may already have a password identity, a suspended role or access to another application. On a denied session, only local SIGA access is rejected. Never grant roles or automatically create an institution from a Google profile.

MFA applies to both password and Google sessions when an enrolled TOTP factor requires AAL2. After completing MFA, recheck the institutional access decision before allowing the app.

## Workspace: separate consent and real Google APIs

The SIGA Google login does not grant Gmail, Drive or Classroom access. An
independent per-user/per-school OAuth PKCE flow is already implemented using
the callback `https://portal-siga.com/api/integrations/google/callback`.
A single-use state is bound to the authenticated Supabase session; AES-GCM
protects the PKCE verifier and provider tokens on the server.

Set `GOOGLE_WORKSPACE_CLIENT_ID`, `GOOGLE_WORKSPACE_CLIENT_SECRET`,
`GOOGLE_WORKSPACE_REDIRECT_URI` and `GOOGLE_WORKSPACE_ENCRYPTION_KEY`
on the SERVER. Enable the requested Google APIs and consent screen.
The separate Google sign-in secret previously exposed must be rotated.

After an individual grants the required scopes, real server operations
are available for Drive, Docs, Sheets, Classroom, Calendar, Gmail and Tasks.
Drive uses limited `drive.file` access; Classroom invitations require
`classroom.rosters`. Gmail for institutional password resets and magic
links remains on branded Resend, not a staff member's Gmail.

The old browser implicit grant remains disabled. With no user consent,
the server fails closed; a merchant ID alone cannot mark Google as connected.
Some Google services have quotas, account eligibility and potential API
billing: consult `docs/security/GOOGLE_WORKSPACE_TEST_PLAN.md`.

## Acceptance tests before merging

1. Existing password user with active school membership signs in and retains their account UUID.
2. Invited user with a *matching pre-existing* Supabase identity signs in with Google; no admin role or school is created automatically.
3. A Google user without an active institutional membership is denied but `auth.users` is **not** deleted.
4. Platform admin without a school membership is admitted to authorized platform routes only.
5. Suspended school membership cannot read another school's data, even with a valid Google session.
6. Reload, tab restore and token refresh require server-side authorization again.
7. Enrolled TOTP factor must reach AAL2 for Google *and* password sign-in.
8. Simulate failed membership lookup, a suspended school and cross-school ID mismatch; protected UI remains closed. Validate server authorization and RLS independently of route guards.
9. Workspace's legacy implicit builders are rejected; stubs do not claim to send emails or create calendar events; the UI says 'not connected'. Verify browser tokens from older builds are cleared.
10. Rotate the leaked Google secret, configure Supabase's Google provider and verify the full real Google redirect end-to-end on a designated test account.

Do not merge merely because unit tests pass: approval also requires quality gates and one real browser login with the rotated credential. No automated test in this PR rotates secrets or changes provider configuration.

## Known release blocker

The GitHub Actions quality and dependency audit jobs have been reported as failed with no job steps available in the accessible API response. This does **not** establish that unit tests, lint or builds passed or failed. Inspect GitHub's job/runner diagnostics or rerun the workflow when the account can execute jobs. Keep the PR in draft until the normal CI checks and end-to-end browser test pass.

## Auth callback safety

Supabase warns that async client calls inside `onAuthStateChange` can deadlock. Follow-up membership and MFA checks are scheduled in a new macrotask (`setTimeout(..., 0)`) rather than awaited in the callback. Subsequent events invalidate older checks using a generation counter.
