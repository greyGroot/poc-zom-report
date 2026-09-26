# EE-CRM agent prompts

These prompts define the working roles used to deliver EE-CRM stories.

## How to use them

### Antigravity slash commands

In Antigravity, workspace skills under `.agents/skills/` allow loading each role directly via slash command in the chat input:

| Role | Antigravity Command | Target Prompt | Chat Mode |
|---|---|---|---|
| Architect | `/architect` or `/architect <task-id>` | `architect-agent.md` | Fresh chat per task |
| UX | `/ux` or `/ux <task-id>` | `ux-agent.md` | Fresh chat per task |
| Full-Stack Developer | `/dev` or `/dev <task-id>` | `full-stack-developer-agent.md` | Fresh chat per task |
| E2E QA | `/qa` or `/qa <task-id>` | `e2e-qa-agent.md` | Fresh chat per task |
| Business Analyst | `/ba` | `business-analyst-agent.md` | Long-running chat |
| Product Owner | `/po` | `product-owner-agent.md` | Long-running chat |
| Antigravity Advisor | `/advisor` | `advisor-agy.md` | Long-running chat |

### Codex and manual prompt usage

For any role in Codex (or when not using slash commands), start or open its chat and provide only the relevant role prompt from this directory.

The UX, Architect, Developer, and QA agents will respond with:

```text
I'm agent: <role>. Which task should I execute?
```

Reply with a task identifier such as `CRM-001`, or describe the requested task. For a story identifier, the agent locates the matching file under `ee-crm/docs/stories/`, follows the role-relevant links, and starts working. A task file may also be attached when it is not already present in the repository.

The initial role response must not inspect the repository or begin work before a task is selected.

Use these prompts in fresh chats:

- `ux-agent.md`
- `architect-agent.md`
- `full-stack-developer-agent.md`
- `e2e-qa-agent.md`

The Business Analyst and Product Owner are intended to remain in their respective long-running chats for as long as practical. They acknowledge their roles and wait for a request; they do not ask for a task ID:

- `business-analyst-agent.md`
- `product-owner-agent.md`

```text
I'm agent: Business Analyst. I'm ready to manage EE-CRM requirements and stories.
```

```text
I'm agent: Product Owner. I'm ready to assess EE-CRM status, priorities, and next steps.
```

Use the platform-specific advisors to improve the agent system without mixing Codex-only and Antigravity-only behavior:

- `advisor-agy.md` — Antigravity prompts, rules, skills, hooks, models, and tool configuration
- `advisor-codex.md` — Codex prompts, `AGENTS.md`, skills/plugins, hooks, permissions, models, and tools

The advisors may be kept as long-running chats so they retain the history and rationale behind agent-system decisions.

The advisors also acknowledge their role and wait for an advisory request; they do not ask for a task ID:

```text
I'm agent: Antigravity Advisor. I'm ready to help improve our Antigravity agentic workflow.
```

```text
I'm agent: Codex Advisor. I'm ready to help improve our Codex agentic workflow.
```

## Expected artifact flow

```text
BA story
  -> UX specification
  -> architecture plan
  -> full-stack implementation
  -> local and deployed E2E QA
  -> Product Owner status and prioritization
```

Default artifact locations:

- Stories: `ee-crm/docs/stories/`
- UX: `ee-crm/docs/ux/`
- Architecture: `ee-crm/docs/architecture/`
- Cumulative E2E QA tests, reports, and evidence: `ee-crm/verification/`
- Product status: `ee-crm/docs/product/`

Follow an existing project convention if the repository already uses a more specific location or filename.
