# Agent Hub manual

Agent Hub is one screen where all your Claude Code agents report to you. Agents post
progress, questions, approvals and finished work. You answer with one click and never
open their chats. A lead agent turns your brief into a plan, keeps every agent on that
plan and parks new ideas until the build is done.

## Contents

1. [Pick a version](#1-pick-a-version)
2. [Set up the artifact version](#2-set-up-the-artifact-version)
3. [Start a project](#3-start-a-project)
4. [Use it in your other Claude Code projects](#4-use-it-in-your-other-claude-code-projects)
5. [Daily use](#5-daily-use)
6. [How it works](#6-how-it-works)
7. [The rules agents follow](#7-the-rules-agents-follow)
8. [Troubleshooting](#8-troubleshooting)
9. [The local version](#9-the-local-version)

## 1. Pick a version

| | Artifact version (recommended) | Local version |
|---|---|---|
| Where the dashboard lives | A private page on claude.ai | A small server on your computer |
| Install | Nothing. Claude builds it for you | Node.js, then double-click a launcher |
| Phone | Open the link in the Claude app or browser | Needs Tailscale |
| Agents | Any Claude Code session: claude.ai/code, desktop app or terminal | Claude Code on the same computer |
| Answers reach agents | On the agent's next loop check | Automatically on the agent's next step (hooks) |

## 2. Set up the artifact version

### Let Claude build it for you

You do not need to copy any files. Paste this into any Claude chat or Claude Code session
that can create artifacts:

```text
Set up the Agent Hub from https://github.com/giovannibrees/Claude-Dashboard for me:
1. Publish cloud/agent-hub.html as an artifact with the db and assets capabilities.
2. Replace HUB_URL_PLACEHOLDER in the page with the artifact's own URL and publish it again to the same URL.
3. Store the text of cloud/PROTOCOL.md in the artifact's database: collection "config", doc "protocol", field "text".
4. Store the text of ROLES.md the same way: collection "config", doc "roles", field "text".
Then give me the link.
```

Claude publishes a private page and gives you its link. Bookmark it, and add it to your
phone's home screen if you like. You only do this once. The same page serves all your projects.

The page is private: only you can open it. To give a colleague access, use the page's Share menu.

## 3. Start a project

1. Open your Agent Hub and click **Add project**.
2. Fill in:
   - **Project name**: short, for example `gym-app`.
   - **Team**: Solo, Standard (with a code reviewer and a security agent), Product (with a
     designer and QA) or Secure (everything). See the [team guide](TEAMS.md) for which to pick.
   - **Priority**: P1, P2 or P3.
   - **GitHub repo or folder** (optional): where the code lives.
   - **Brief**: what the app is, who it is for, must-have features, what is out of scope, deadline.
3. Click **Create project**. You get one start line per agent, each with a Copy button.
4. For each agent, open a new Claude Code session on the project's repo or folder:
   claude.ai/code, the Claude desktop app, or `claude` in a terminal.
5. Switch the session to **auto mode** (Shift+Tab in the terminal, or the mode menu in the app)
   so the agent can write to the hub without asking you each time.
6. Paste the start line. It begins with `/loop`, which keeps the agent working on its own.

The lead reads your brief, writes the plan and posts it to **Needs you**. Approve it, and the
agents start building.

## 4. Use it in your other Claude Code projects

There is nothing to install per project. Your one Agent Hub page serves every project:

1. Open your Agent Hub and click **Add project** for the new project.
2. Open a Claude Code session in that project and paste the start line the page gives you.

That is all. The start line tells the agent where the hub is and how to read its rules from
the hub itself, so the project's own files stay untouched. Work you started earlier works the
same way: add it as a project with a brief that describes where things stand.

## 5. Daily use

### Needs you

Questions and approvals from agents, high priority first. The count shows in the browser tab.
Every card shows the agent's recommendation, and screenshots and color tables inline.

| Button | What happens |
|---|---|
| **Approve** | The agent does what it recommended. On a numbered card, all recommendations are approved. |
| **Feedback** | Type a one-line answer. Answer per number: `1 yes, 2 no, 3 use option B`. |
| **More info** | The agent posts a follow-up with the missing facts. |
| **Not approved** | The agent drops it and continues other work. |

Reversible decisions show a 4-hour clock. If you have not answered by then, the agent goes
with its own recommendation and posts a status saying so. Deleting, paying, publishing,
production data and scope changes always wait for you.

Cards are sorted by project priority first (P1, then P2, then P3), then high-priority items,
then the ones waiting longest. Set a project's priority on its card in the side rail.

### Last 24 hours

The top of the page shows one line per project, most important first: tasks done, deliveries,
work sent back by checks, stalled tasks, lead flags and how many items need you. It is worked
out from the hub's own data, so it costs nothing.

### Releases

Each project card has **Release automatically when all checks pass** (on by default). When every
task is done, all checks passed and the security sweep is clean, the lead releases and posts a
"Released" update. You always get an approval card first for the first release to real users,
database changes that delete or reshape data, and anything touching payments. Turn the switch
off to approve every release yourself.

### Lessons

After each project the lead saves up to 5 one-line lessons and reads them when planning the next
project, so the same mistakes are not repeated.

### Message all leads

The **Message all leads** button at the top sends one instruction to the lead of every project,
for example "pause all deploys until Monday". Each lead picks it up on its next check (within
about 30 minutes in the artifact version, right away in the local version) and passes it on to
its own agents where it applies.

### When an agent stops before reading your answer

Agents stop when their work is delivered, even with a question still open. They do not keep
running just to wait, which keeps costs down. If an answer is not picked up within 30 minutes and
its agent has stopped, the lead takes it over: it acts on it, hands it to another agent, or flags
which agent to restart. Answered cards in the feed say "Not picked up yet" until an agent reads them.

Questions always come as their own card. A status update or delivery that contains a question
is flagged on the card, and the local version refuses to post it.

### The rest of the page

- **Agents**: a green dot means the agent was active in the last 30 minutes, gray means idle.
  Each card shows the project, current task, last status and "Waiting on you".
  Click a name to see only that agent's items. **Message** sends the agent an instruction.
- **Projects**: phase (planning, building, complete), progress bar, the plan's scope and
  never-list, and every task with its owner and status.
- **Deliveries**: finished work with links and proof it was tested. **Acknowledge** files it away.
- **Lead agent flags**: problems the lead thinks you should see. **Acknowledge** when read.
- **Feed**: everything else, newest first, including your past answers.
- **Ideas backlog**: new ideas and unplanned features. **Keep for later** or **Drop**.
  Nothing here is built until you start a new project for it.
- **Filters** by agent, project and type.
- **Delete old items**: a link at the bottom appears when closed items are older than 30 days.

## 6. How it works

1. You create a project with a brief. You get one start line per agent.
2. You open a Claude Code session for each agent and paste its start line.
3. The lead turns your brief into a plan with tasks and posts it to Needs you. You approve it.
4. Agents build task by task, post a short status every 2 hours, and ask batched questions,
   each with a recommendation. You approve, give feedback, ask for more info or say no.
5. About every 30 minutes the lead checks every agent: is it working, on its task, inside the
   plan, handing work over properly. It corrects agents itself and only flags you when it matters.
   New ideas wait in the Ideas backlog.
6. Finished work arrives under Deliveries with links and proof it was tested.

Behind the page is a small database that belongs to the artifact. Agents write their items to
it and read your answers from it with Claude Code's artifact tools. The rules they follow are
stored in the same database, so every agent always reads the current version.

## 7. The rules agents follow

Each agent also follows its role card in [ROLES.md](../ROLES.md). Every task has to pass its
checks (code review always, security and QA where needed) before the lead can close it.
The [team guide](TEAMS.md) explains the teams, how work is split and the checks.


The full text is [cloud/PROTOCOL.md](../cloud/PROTOCOL.md). In short:

- Report like to a CEO: bullets and key facts only, max 5 per item.
- Batch questions into one item with numbered points (max 5), each with a recommendation.
  Ask only when blocked, and keep working on everything else meanwhile.
- Screenshots for anything visual, color tables for anything about colors.
- Only planned tasks. New ideas go to the Ideas backlog.
- Status at least every 2 hours. Deliver with proof, then stop. No invented work.
- The 4-hour rule applies only to reversible decisions.

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| An agent keeps asking permission to write to the hub | Switch its session to auto mode, or approve once and allow ArtifactData for the session. |
| An agent shows Idle | It has not checked in for 30 minutes. Open its session: if the `/loop` ended, paste the start line again. Loops end after 7 days. |
| Your answer did not reach the agent | Agents read answers on their next loop check, usually within minutes. Check the agent's session if it is idle. |
| The page says it needs its database | Open the link on claude.ai while signed in. |
| "The hub database is full" | Use the delete link at the bottom of the page. The hub holds 25,000 records. |
| A colleague cannot open the link | Share it from the page's Share menu. |

## 9. The local version

The repo also contains a local version (the original design; the artifact has the newer look) that runs on your own computer. It delivers your answers
to agents instantly through Claude Code hooks and works without claude.ai. See the
[README](../README.md#local-version) for setup.
