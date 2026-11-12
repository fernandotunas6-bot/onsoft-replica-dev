# BigBlueButton — Backend adapter (initial implementation)

This change adds a **server-only integration primitive**, not a deployed classroom module.

## Configuration
Set `BBB_API_URL=https://bbb.example.org/bigbluebutton/api/` and `BBB_API_SECRET` **only in server secrets**. Never use a `VITE_` prefix. The server must have outbound HTTPS connectivity to BBB.

## Security boundary
The adapter does **not** authenticate users or authorize school membership. A trusted authenticated server handler must verify the active school, staff/student role, teacher assignment, enrollment and session ownership against Supabase before calling these functions. Never expose raw BBB XML, moderator passwords or the signed join URL to an unauthorized client. Do not allow arbitrary meeting IDs from the browser; generate scoped IDs from validated database records.

## API
`bbbSignedUrl`, `createBbbMeeting`, `getBbbJoinUrl`, `endBbbMeeting`, `getBbbMeetingInfo`, `getBbbRecordings`, `scopedMeetingId`.

The adapter uses BBB's SHA-1 checksum as required by its API, **not** as an application password-hashing algorithm. BBB XML responses need schema-aware parsing in an authorized server endpoint. Network failures are sanitized.

## Pending before classroom use
- [ ] Confirm BBB server version, provisioning, DNS, TLS, TURN and capacity.
- [ ] Implement authenticated server routes and per-school RLS-backed classroom/session tables.
- [ ] Add professor, student and pedagogical interfaces with access controls.
- [ ] Add calendar, attendance validation, recordings, consent, retention and notifications.
- [ ] Add unit, integration, cross-tenant, load and mobile tests.
- [ ] Configure production secrets, pilot and monitored rollout.

No server was provisioned and no production deployment was attempted.
