# AI Design Agency for Slack (n8n)

A Slack bot that plans an Instagram campaign, draws one proof-of-concept post, checks it with a real Vision QA step, and only generates the other 9 posts after a human clicks **Approve**.

```
@DesignBot client: maria_b_study Plan 10 posts for the winter wedding season
```

## What happens

1. Slack mention reaches the n8n webhook. The Slack signature is verified. Slack retries are ignored.
2. **Intake gate:** a cheap AI call (gpt-4o-mini) reads the request and extracts the brief: platform and size, goal, product, audience, look and mood, real photos. The extracted values are validated in code.
   - If platform, goal and product are all clear (and photos for fashion clients), it goes straight on.
   - Otherwise the bot posts what it understood, what is missing, and a button. The button opens a Slack form with 6 questions, pre-filled with everything already known. Nothing is generated until the form is submitted.
   - The bot repeats the confirmed brief back before it starts.
   - Add `--quick` to a request to skip the questions (safe defaults).
3. The bot loads the client brain (brand rules, approved work, rejections, rules learned from past edits).
4. GPT-4o plans all 10 posts for the confirmed brief (headline, image prompt, caption, hashtags). The image size comes from the chosen platform.
5. Post 1 is drawn with Ideogram v2.
6. Vision QA reads the image. Spelling is compared in code. If it fails, the image is redrawn up to 2 times with the QA feedback added to the prompt.
7. The image is uploaded to Slack (so it never expires) and a review card appears with the real QA result.
8. Buttons:
   - **Approve**: posts 2 to 10 are generated, each one QA-checked, and posted to the thread.
   - **Request changes**: a Slack form asks what to change. The note is applied to a new draft and saved as a learned rule for that client.
   - **Discard**: the job stops. Nothing more is spent.

The 6 intake questions: where it will be posted (size), goal, product or collection, audience (optional), look and mood (optional), real product photos. Sizes supported: Instagram Feed 4:5, Square 1:1, Story/Reel 9:16, Landscape 16:9.

See `docs/system-architecture.md` for the flowchart.

## Files

| File | What it is |
|---|---|
| `slack-design-agent-2stage-workflow.json` | Main workflow (generated). Import this into n8n. |
| `error-notifier-workflow.json` | Optional. Posts failed runs to a Slack channel. |
| `client-brain/*_brain.json` | One file per client. `apex_athletics` (sample) and `maria_b_study` (study example). |
| `client-brain/client-memory-schema.json` | Schema for a brain file. |
| `src/code/*.js` | Source of every Code node, readable and testable. |
| `tools/build_workflow.py` | Builds the workflow JSON from `src/code` and `client-brain`. |
| `src/shared/intake_options.json` | The platform, goal and photo options used by the intake questions. Edit it to add a size. |
| `tests/run_tests.mjs` | 63 checks that run the Code nodes with mocked n8n. |
| `archive/` | The old direct workflow. It has no QA and no approval gate. Kept for reference only. |

## Setup

### 1. Slack app
Create an app at api.slack.com/apps with these bot scopes: `app_mentions:read`, `chat:write`, `files:write`.
- **Event Subscriptions**: Request URL `https://YOUR-TUNNEL/webhook/slack-design-agent`, subscribe to bot event `app_mention`.
- **Interactivity and Shortcuts**: Request URL `https://YOUR-TUNNEL/webhook/slack-interactivity`.
- Install the app and invite it to your channel.
- Use the **production** URL (workflow must be Active). Test URLs (`/webhook-test/`) do not keep job memory.

### 2. Environment
Copy `.env.example` to `.env`, fill the keys, and load them before starting n8n (the launch scripts set the n8n flags for you). Needed:
`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `OPENAI_API_KEY`, `IDEOGRAM_API_KEY`.

### 3. Run
```
start-n8n.bat        (or .\start-n8n.ps1)
npx ngrok http 5678  (or: cloudflared tunnel --url http://localhost:5678)
```
Import both workflow files, **activate** the main one. For the error notifier: set `SLACK_ALERT_CHANNEL`, activate it, then open the main workflow, Settings, "Error workflow", and select it.

## Add a client
1. Copy `client-brain/maria_b_brain.json` to `client-brain/<client>_brain.json`.
2. Fill the brand guidelines. Set `aliases` (words that select the client) and optionally `slack_channel_ids`.
3. Run `python3 tools/build_workflow.py` and import the workflow again.
4. Pick the client in Slack with `client: <client_id>`, by alias, or by channel.

Past approvals and rejections go into `approved_past_work` and `rejection_history`. Edits clients request through the modal are added automatically while the workflow runs.

## Cost guard
Each client has `limits.max_images_per_day` (default 40, or `DAILY_IMAGE_LIMIT`). Every image render counts, including QA retries. New jobs and approvals are refused when the budget is used up.

## Tests
```
node tests/run_tests.mjs
```
These test the logic of every Code node. They do not call Slack, OpenAI or Ideogram.

## Known limits (read before selling this)
- **Not tested against live Slack, OpenAI and Ideogram.** The Code nodes are tested; the HTTP calls follow the public API docs. Run one real campaign in a test Slack channel first. The Slack file upload step (3 calls) is the most likely place to need a tweak.
- Job memory and learned rules live in n8n workflow static data. They only persist while the workflow is **active**, and are lost if you delete the workflow. For many clients, move them to a database or Google Sheet.
- Slack file uploads need `files:write`. Ideogram image URLs expire, so images are copied into Slack right away.
- Ideogram `magic_prompt_option` is set to `OFF` so it does not rewrite the headline text.
- **Fashion brands:** AI invents clothes. The intake asks about real photos and tells the Creative Director never to draw the garments, but **the workflow does not yet place the attached photo into the design**. That step (real photo composited with an AI background) is the next feature to build.
- Model prices change. Check OpenAI and Ideogram pricing before quoting a client.
