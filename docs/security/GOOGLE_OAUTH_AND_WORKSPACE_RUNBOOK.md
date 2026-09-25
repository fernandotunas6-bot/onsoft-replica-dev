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

The `AuthGate` fails closed on initial/restored sessions, sign-in, refresh and profile changes. It calls `verifyInstitutionalAccessFn`. A user needs a *current* `school_memberships.status='active'` or an entry in `platform_admins`. Both are server-owned database records and are checked using a server-only administrative client. Never trust Google `email`, `user_metadata`, browser `sessionStorage`, the current route or a locally remembered role for authorization. Data APIs must separately enforce institution-scoped RLS and permission checks.

**Never automatically delete `auth.users` when membership verification fails.** A person may already have a password identity, a suspended role or access to another application. On a denied session, only local SIGA access is rejected. Never grant roles or automatically create an institution from a Google profile.

MFA applies to both password and Google sessions when an enrolled TOTP factor requires AAL2. After completing MFA, recheck the institutional access decision before allowing the app.

## Workspace: separate consent, separate backend

Workspace permissions are **not** login privileges. The old client-side implicit grant (`response_type=token`) is disabled in both legacy modules; incoming access-token URL fragments are rejected and bearer tokens are no longer persisted in `localStorage`. Existing server-side stub functions now return an explicit "not connected" status rather than fabricated success IDs.

To introduce Workspace functionality safely, implement a **separate** OAuth authorization-code + PKCE flow with a new registered callback (not the Supabase Auth callback), per-user/per-school consent and minimum scopes. Keep the verifier, state, refresh tokens and provider credentials server-side; use a server-side encrypted token store with narrow access controls, rotation, revocation and audit. Before re-enabling Gmail, Calendar and Sheets, implement the actual Google API operations and test real provider responses. Never infer "connected" from the presence of a `GOOGLE_CLIENT_ID` environment variable.

## Acceptance tests before merging

1. Existing password user with active school membership signs in and retains their account UUID.
2. Invited user with a *matching pre-existing* Supabase identity signs in with Google; no admin role or school is created automatically.
3. A Google user without an active institutional membership is denied but `auth.users` is **not** deleted.
4. Platform admin without a school membership is admitted to authorized platform routes only.
5. Suspended school membership cannot read another school's data, even with a valid Google session.
6. Reload, tab restore and token refresh require server-side authorization again.
7. Enrolled TOTP factor must reach AAL2 for Google *and* password sign-in.
8. Simulate failed membership lookup; protected UI remains closed. Validate server authorization and RLS independently of route guards.
9. Workspace's legacy implicit builders are rejected; stubs do not claim to send emails or create calendar events.
10. Rotate the leaked Google secret, configure Supabase's Google provider and verify the full real Google redirect end-to-end on a designated test account.

Do not merge merely because unit tests pass: approval also requires quality gates and one real browser login with the rotated credential. No automated test in this PR rotates secrets or changes provider configuration.
