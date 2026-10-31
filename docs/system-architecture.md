# System architecture

Everything below exists in `slack-design-agent-2stage-workflow.json`.

```mermaid
flowchart TD
  A["Slack mention"] --> B["Events webhook"]
  B --> C["Verify Slack signature"]
  C -->|invalid| X["401"]
  C -->|valid| D{"URL verification?"}
  D -->|yes| E["Reply with challenge"]
  D -->|no| F["Reply 200 right away"]
  F --> G{"Real mention, not a retry?"}
  G -->|yes| H["Post ack in thread"]
  G -->|yes| I["Load client brain + learned rules, check daily limit"]
  I -->|limit reached| J["Post limit message"]
  I --> IE["Intake Evaluator: extract platform, goal, product, audience, style, photos"]
  IE --> IC{"Platform, goal and product clear?"}
  IC -->|no| IQ["Post checklist + button"]
  IQ --> IM["Slack form with 6 questions, pre-filled"]
  IM --> IS["Save brief, confirm it in thread"]
  IC -->|yes| CP
  IS --> CP["Build CD prompt with brief and image size"]
  CP --> K["GPT-4o: plan 10 posts"]
  K --> L["Save plan on job, queue Post 1"]
  L --> Q

  subgraph Pipeline["Render pipeline (one post at a time)"]
    Q["Post Queue Loop"] --> R["Ideogram v2: render"]
    R --> S["GPT-4o Vision QA"]
    S --> T{"Text exact, sharp, no distortion?"}
    T -->|no, retries left| U["Add QA feedback to prompt"] --> R
    T -->|yes, or retries used| V["Upload image to Slack"]
    V --> W{"Mode"}
    W -->|draft| Y["Review card with 3 buttons"]
    W -->|batch| Z["Post caption, next post"] --> Q
  end

  Y --> BTN["Slack interactivity webhook"]
  BTN --> SIG["Verify signature, reply 200"]
  SIG --> RT{"Button"}
  RT -->|Approve| AP["Queue posts 2-10"] --> Q
  RT -->|Request changes| MD["Open modal"] --> SUB["Save as learned rule, queue revised draft"] --> Q
  RT -->|Discard| DS["Close job, remove buttons"]
```

## Job memory
Stored in n8n workflow static data (works while the workflow is active):
- `jobs[job_id]`: client, Slack channel and thread, confirmed brief, campaign plan, status (`intake`, `awaiting_intake`, `planning`, `drafting`, `awaiting_review`, `revising`, `generating`, `complete`, `discarded`), QA warning count.
- `learned[client_id]`: rules created from "Request changes" notes (last 20).
- `usage[client_id][date]`: images rendered per day.

## Why one pipeline for draft and batch
Stage 1 sends Post 1 and stage 2 sends Posts 2 to 10 into the same loop. QA, retries, uploads and delivery are written once.

## Cost levers
- Draft first: 1 plan call + 1 image + 1 QA call before a human approves.
- Retries are capped at 2 per image.
- Daily image limit per client.
