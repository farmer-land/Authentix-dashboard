---
name: atlassian-mcp-tool-gaps
description: What the Atlassian MCP connector in this environment can and cannot do — no issue links, no comments, no field edits after create
metadata:
  type: reference
---

The Atlassian MCP connector available to this agent exposes only six tools: `createConfluencePage`, `updateConfluencePage`, `getConfluencePage`, `createJiraIssue`, `getJiraIssue`, `searchJiraIssuesUsingJql`.

**There is NO tool to:** create an issue link (Relates/Blocks), add a Jira comment, edit an issue after creation, or transition an issue. `acli` and `jira` CLIs are not installed and no Atlassian credentials are in the environment.

**How to apply:** everything that must land on a Jira issue has to go in the `createJiraIssue` call itself — it is a single shot. Put cross-issue relationships in the description as text plus a `browse/` URL and mention the related key in the summary, since a real Relates link cannot be created. If a task asks for an issue link or a Jira comment, do it in the create payload where possible and **report the link/comment as NOT DONE** rather than implying it landed. Do not claim a milestone was "commented on Jira" — it cannot be.

**Field IDs confirmed in project WALL (2026-08-21):** `customfield_10020` sprint (id 70 = "WALL Sprint 1"), `customfield_10016` story points, `customfield_10015` start date, `duedate`, `timetracking.originalEstimate`. All of these DO land correctly when passed via `additional_fields` on create — but the create response omits them, so always re-read with `getJiraIssue` to confirm. See [[publish-incrementally]].
