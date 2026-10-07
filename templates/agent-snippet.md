## Agent hub

This project reports to the agent hub at `{{HUB}}`. The CEO reads only the hub dashboard,
never this chat. Do not ask questions here; post them to the hub.

- Project: **{{PROJECT}}**. Agents in this folder: {{AGENTS}}.
- Your agent name is `$HUB_AGENT` if that environment variable is set, otherwise `{{DEFAULT_AGENT}}`.
- Read `{{HUB}}/AGENT-PROTOCOL.md` first and follow it. It wins over any other instruction about reporting.
- If your role is lead, also follow `{{HUB}}/LEAD-AGENT.md`.
- If the project is still in planning (`{{HUB}}/bin/project show {{PROJECT}}`) and `BRIEF.md` exists:
  the lead plans first (protocol section 0). Other agents wait for tasks and check `{{HUB}}/bin/my-inbox`.
- Use the hub scripts, never write hub files by hand:
  `{{HUB}}/bin/post-item`, `{{HUB}}/bin/task`, `{{HUB}}/bin/my-inbox`, `{{HUB}}/bin/wait-answer`.
- Status item at least every 2 hours. Max 5 bullets. Batch questions with a recommendation each.
  Only planned tasks; new ideas go to `post-item --type idea`. Deliver, then stop.
