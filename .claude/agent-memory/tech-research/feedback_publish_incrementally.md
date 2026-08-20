---
name: publish-incrementally
description: Create the Confluence page skeleton FIRST and update it after each research theme — never batch the write-up to the end
metadata:
  type: feedback
---

For any research or audit task: create the deliverable (Confluence page, ticket) as a skeleton BEFORE deep work, then update it after each theme. Never save the write-up for the end.

**Why:** A previous attempt at the "why agents ship wrong fixes" research died after 4 tool calls having spent 119,000 tokens and produced nothing; a retry hit a session limit. Organisation-wide, 26% of subagent tokens on 2026-08-20 went into runs that died at the final step with nothing delivered. An agent that persists as it goes loses minutes; one that persists at the end loses everything.

**How to apply:** skeleton with heading stubs marked NOT YET RESEARCHED -> research one theme -> update page immediately -> repeat. If running low on turns, make the page truthful about what is and isn't covered rather than trying to finish. Same rule for Jira: create the ticket when the finding lands, and re-read it immediately to confirm fields stuck (these projects silently drop priority/labels/estimate on create).
