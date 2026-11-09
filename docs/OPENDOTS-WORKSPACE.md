# OpenDots workspace first slice

This is an OpenDots-inspired feature port into OpenMuse, not a full merge of the OpenDots application or runtime. Reference audited: CopilotKit/OpenDots commit d4214aff10f066911f3253cb3cb870764cd51a9f (MIT, copyright Atai Barkai).

Open Apps > OpenDots · Spaces & pages > Open Spaces & pages.

Included:
- Named Spaces and searchable page titles.
- Manual text/Markdown pages with explicit Save.
- Owner-scoped persistence in Muse's existing `records` store. No new database, table, schema, SDK, service, environment variable or model route.
- Revision checks reject stale/concurrent edits instead of silently overwriting.
- Unsaved device drafts are recovered when the same page is reopened. Drafts are device-local, not synced; Save writes the page to the server. Discard removes that device draft and loads the saved version.

Not included: specialist Dots, AI page conversations, rich visual editor, nested pages, autosave to server, collaboration/sharing, calls, Slack, MCP connections, per-Dot computers or Automatic Learning. The existing OpenBot setting remains a separate, disabled computer-backend adapter.

The port uses no new Intelligence requests for manual pages. Existing Muse chat continues to use its already-configured Intelligence project and model. CopilotKit's pricing page on November 10, 2026 lists free hosted Intelligence at 1,000 interactions per organization per month, with optional $49/month PAYG. This port does not upgrade or verify the existing account's billing plan. Local evaluation is non-production and is not suitable for the free Render instance. Do not enable paid services to complete this slice.

References:
- https://github.com/CopilotKit/OpenDots
- https://github.com/CopilotKit/OpenDots/blob/main/docs/SETUP.md
- https://www.copilotkit.ai/pricing
