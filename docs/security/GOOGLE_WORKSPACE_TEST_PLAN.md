# SIGA Plus — Google Workspace acceptance and mass tests

The user individually connects their own Google identity for each school through
`/configuracoes`. The app must never infer Gmail/Drive consent from a SIGA login.

## Real capabilities and restrictions

| API | Available operations | Scope |
| --- | --- | --- |
| Drive | List files shared with the app, create folders and text files | `drive.file` |
| Docs | Create a document | `documents` |
| Sheets | Create a spreadsheet and append report rows without formula evaluation | `spreadsheets` |
| Classroom | List/create courses and invite teachers or students | `classroom.courses`, `classroom.rosters` |
| Calendar | List/create lessons and examinations | `calendar.events` |
| Gmail | Send explicitly requested messages | `gmail.send` |
| Tasks | Find task lists, list and create tasks | `tasks` |

Google Classroom does not guarantee that ordinary teachers may directly enrol
students. The SIGA API uses invitations for students/co-teachers; Google imposes
its own account, domain and Education licence requirements.

## Automated checks (mocked, safe to run in CI)

```bash
bun install --frozen-lockfile
bun run test:google:oauth
bun run test:google:mass
bun run lint
bun run build
```

The service suite performs 1,400 operations against a **mock** Google transport:
1,600 simulated HTTP calls (Tasks resolves an actual task list). A second suite
checks all seven permission sets, OAuth authorization-code PKCE, 500 unique states,
AES-GCM encryption, tampering and invalid credentials. Thirteen contract checks
review password reset, magic links, email changes, Gmail/Resend separation, JWT
validation, MFA, the OAuth callback and account preservation.

No mocked success establishes that live tokens exist or Google accepted a request.
Test real Gmail delivery ONLY to a designated consenting test mailbox. Never
send bulk real email, create hundreds of live Classroom courses or upload bulk
student data for load testing.

## Manual pre-production checks

1. Rotate any previously exposed Google OAuth secrets. Use one OAuth client for
   Supabase login and a separate client for Workspace consent.
2. Configure these SERVER secrets: `GOOGLE_WORKSPACE_CLIENT_ID`,
   `GOOGLE_WORKSPACE_CLIENT_SECRET`,
   `GOOGLE_WORKSPACE_REDIRECT_URI=https://portal-siga.com/api/integrations/google/callback`,
   `GOOGLE_WORKSPACE_ENCRYPTION_KEY` (base64-encoded 32-byte key). Back up the key.
3. Enable Drive, Docs, Sheets, Classroom, Calendar, Gmail and Tasks APIs only as
   needed. Configure the Google OAuth consent screen and verify requested scopes.
4. Connect only Drive and Calendar first. Confirm read-only probes, create one
   folder and one event, then disconnect and verify no further operations work.
5. Test Docs, Sheets, Classroom and Tasks one service at a time using non-sensitive
   sample records. Validate Google account permissions for course creation.
6. Send one Gmail test message and verify it arrives; separately exercise branded
   password reset, magic link and address change through Resend.
7. Revoke a membership mid-session, suspend the school, change active schools,
   reload the browser and verify that foreign-school tokens cannot be accessed.
8. Check Google Cloud daily quotas, budget notifications and consent verification
   before any multi-school rollout. A free Google account or API quota is not a
   guarantee of unlimited free usage.

## Release blockers

The GitHub Actions quality/security jobs have recently failed without accessible
step logs. Do NOT merge this draft PR until Vitest, typecheck/build, security
audit and one complete real Google authorization round-trip pass. The current
changes do not modify production credentials or send live Google messages.
