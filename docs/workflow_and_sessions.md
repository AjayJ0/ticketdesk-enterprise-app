# Ticket ownership, handoffs, reporting and sessions

## Account identity

Each tab stores its own session in sessionStorage and keeps it across navigation/reload. Shared legacy localStorage tokens are never imported. Explicit Logout clears the return route before another sign-in. Pending profile/login/logout responses cannot overwrite a newer session. Concurrent expired requests share one refresh request, whose account identity and role must match the current session.

Access JWTs and refresh records are bound to a permanent random account identity plus the issued role. Numeric SQLite IDs can be reused after deletion; reusing an ID does not make an old session valid for the replacement account. A role change requires explicit sign-in. This release invalidates pre-migration sessions once; passwords are unchanged. Tests use isolated browser storage and, for live UI integration, a separate verification database/API/key on port 18000. They must not log users in through the walkthrough browser.

## Ticket workflow

Employees select an active responsible support team and category. Consultants see their own tickets and that team's unassigned Open queue. Filters and direct ticket/attachment URLs enforce backend permissions. A conditional database update makes Accept atomic. Only one consultant can claim a shared ticket, and other consultants lose queue/detail/notification access after the claim. The accepted consultant explicitly starts work. Employee conversations and status history identify the consultant and actions.

Public conversation is available to the employee, assigned working consultant and administrator. Internal notes remain hidden from employees. Ancestors of an accessible transferred ticket are readable for previous diagnosis, attachments and history. Closed/Transferred tickets are read-only until a supported reopen; transferred ancestors cannot be reopened. The page and queue poll every five seconds. A message saying an issue is solved never changes its status. The consultant explicitly clicks Close; an employee cannot close through the API.

Transfer validates the target team and optional consultant membership, marks the old record Transferred (never Resolved), and creates one linked Open successor for the same employee. Unique parent/successor links and conditional updates prevent duplicate successors during retries/concurrency. The successor retains the original SLA start, response deadline/response and resolution deadline/breach state. It records its own team receipt and work start. All earlier linked records remain accessible to the receiving consultant. The old consultant loses active work but retains their own prior work record.

## Reports

Consultant reports, agent metrics and CSV exports are scoped server-side to tickets they currently own or have a durable work record for. Query parameters cannot select another user or organization scope. Shared available team tickets do not appear in personal reports until assigned/accepted. Transferred records retain work attribution, and a later consultant's resolution is not credited to an earlier reassigned worker. Each ticket record appears once; a transfer successor is a separate work segment. Reports also show distinct original requests, so multiple segments are not presented as multiple original requests. Administrator organization SLA evaluation uses the latest linked ticket once per original request. Administrator alone retains aggregate reporting and SLA Alerts.

## Migration and deployment

Back up the database, then run `alembic upgrade head` from backend with the intended DATABASE_URL. Revision 0003 adds receipt/start/transfer timestamps, transfer links and durable work records. Revision 0004 adds permanent account stamps and session bindings. The existing local walkthrough database has already been upgraded to 0004 and original column data was compared before/after both migrations; backups are retained in backend/backups. No account passwords were changed. Routine startup no longer deletes legacy users/tickets.

Historical precise acceptance/start times were not reliably recorded before this release and cannot be reconstructed. Existing original team receipt defaults to the original ticket creation; new actions are timestamped from this release. Conversation/queue updates use polling rather than WebSockets. SMTP/SMS and business-hours SLA scheduling are outside this change. PostgreSQL migration/concurrency should be verified in the target deployment; automated integration here uses SQLite.

## Verification

Backend tests include competing claimants, concurrent handoffs, team and employee isolation, conversation and explicit closure, lineage/SLA continuity, personal JSON/CSV scopes, reused user IDs and role-bound sessions. Frontend tests cover per-tab sessions, stale asynchronous responses, refresh identity checks and role-based UI. `Workflow.live.test.tsx` is opt-in: set VITE_RUN_ISOLATED_WORKFLOW=1 and VITE_API_BASE_URL=http://127.0.0.1:18000/api/v1 only when running a separate server whose APP_ENV=verification and signing key/database differ from the user's app. It refuses to contact the user API.


## Updated dashboard and handoff decisions

Transferred work segments now have status Closed and a separate Transferred outcome. They keep their transfer timestamp and never acquire a false resolved timestamp. Both transfer closures and final closures show Closed in the SLA monitor, while historical breach flags and the original successor deadline remain intact. Revision 0005 normalizes legacy Transferred statuses with an appended audit event rather than changing old audit rows.

The consultant My Team Queue lists only unassigned Open work for that team. Accepted work disappears for the accepting consultant as well as peers and is retained in My Tickets. Targeted staff handoffs remain in the recipient's My Tickets awaiting acceptance. Consultants have no Assigned to Me navigation. Administrator Assigned to Me is a pending escalation inbox, including sender and predecessor details. Accept moves it to My Tickets; Reject and Redirect closes the pending segment with a transfer outcome and creates a linked Open redirect, so the request is never dropped. Escalation can target an active administrator independently of their team membership.

The employee dashboard has no Report Incident, Self-Service Runbooks or Corporate Identity shortcut cards, and no Overdue, Average Resolution or SLA Compliance metrics. Normal ticket creation, My Tickets, profile and knowledge base navigation remain available. Average Resolution metrics are removed from all user interfaces. Administrator dashboard has no agent workload/performance table; its Overdue card shares the outstanding SLA alert query, and SLA Alerts Today counts the first recorded breach per original request in the India calendar day, deduplicated across recipients and handoffs. Closed alerts leave the active count but stay in that day's cumulative total. As with existing notifications, discovery is driven by application polling rather than an unattended background scheduler.

## Latest employee provisioning update
Employee creation now includes the same optional Department and Support Team selectors and inline Create new options as staff creation. Values persist for every role and switching roles preserves them. Employee role and ticket permissions remain unchanged.
