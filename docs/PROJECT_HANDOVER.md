# Project Handover: Slack AI Design Agency (n8n)

Written 2026-10-31, updated the same day after the first live run (v4: test mode). Purpose: let a new chat (or a new person) continue this project without re-explaining anything. Paste or attach this file at the start of the next chat.

## 1. Who and why
- Owner: Muhammad Aqib Rauf (BS CS student, AI automation intern and freelancer in Pakistan).
- Goal: turn this n8n project into a sellable freelance service (AI-made social media content for brands), with a Maria B style fashion brand as the study and portfolio example.
- Working style that suits the owner: step-by-step, simple language, Roman Urdu or Hinglish explanations are fine, practical next steps, honest warnings when something is a bad idea.
- Environment: NEW Windows laptop (user LENOVO), project folder `C:\Users\LENOVO\Downloads\ai-design-agency-n8n-v3\ai-design-agency-n8n` (the old `D:\Mota bhai projects\Maria B agent` was on the previous laptop). n8n 2.45.7 at `http://localhost:5678`. Slack workspace "Rodo workspace" (owner account rudo_rauf3, second account "Agent" is the owner's own), bot app **GD Bot** (App ID A0CDM8F8ULT), channel `#new-channel` (ID C0CDK1BF5MG). cloudflared is installed but not on PATH: run it as `& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:5678`.

## 2. What the project is
A Slack bot built in n8n. A team member mentions the bot with a request. The bot checks the brief, plans a 10-post Instagram campaign with GPT-4o, draws Post 1 with Ideogram v2, checks the image with GPT-4o Vision, shows a review card in Slack, and only after a human clicks Approve does it generate posts 2 to 10.

Original project (the zip the owner first attached, `slack-ai-design-agency-n8n-main`) was a prototype with marketing claims that the code did not back up. See section 4.

## 3. Final flow (what exists now)
Events path (`/webhook/slack-design-agent`):
1. Verify Slack HMAC signature. Ignore Slack retries (`x-slack-retry-num`). Answer the URL challenge.
2. Reply 200 immediately, then continue.
3. Post an acknowledgement in the thread.
4. Load the client brain (picked by `client: <id>` tag, alias word, Slack channel id, or `DEFAULT_CLIENT_ID`). Create a job. Check the daily image limit.
5. **Intake gate:** gpt-4o-mini extracts platform, goal, product, audience, style, photos from the request. Values are validated in code. If platform, goal and product (and photos for fashion clients) are clear, continue. Otherwise post a checklist and a button that opens a Slack form with 6 pre-filled questions. After the form is submitted, the confirmed brief is repeated in the thread. `--quick` in the request skips the questions.
6. Build the Creative Director prompt (brain + confirmed brief + image size). GPT-4o returns a 10-post JSON plan. Post 1 becomes the draft.
7. Render pipeline (one post at a time, shared by draft and batch): Ideogram v2 render, GPT-4o Vision QA, code checks the spelling and score (pass needs exact headline, score 80 or more, not blurry, no distortion, no banned element). On failure redraw up to 2 times with the QA feedback added to the prompt. Then upload the image to Slack (permanent), then post the review card (draft) or caption (batch).

Interactivity path (`/webhook/slack-interactivity`): verify signature, reply 200, route the action:
- Approve: queue posts 2 to 10 into the same pipeline, replace the card.
- Request changes: modal asks what to change, saves the note as a learned rule for the client, regenerates Post 1.
- Discard: close the job and remove the buttons.
- Intake form open and submit.

Memory: n8n workflow static data (jobs, learned rules, daily usage). Works only while the workflow is Active (Published). Lost if the workflow is deleted.

## 4. What was found wrong in the original, and what was done
| Original problem | Result |
|---|---|
| Buttons did nothing (no interactivity webhook) | Built |
| QA was fake (hardcoded "PASSED 92/100", hardcoded headline "LIMITLESS") | Real QA, spelling checked in code, retry loop |
| Card showed a fixed Apex caption | Uses the AI's caption and hashtags |
| Brain hardcoded in one Code node, JSON files unused | Brains built from `client-brain/*_brain.json`, multi-client |
| Ideogram URLs expire | Image copied into Slack (files.getUploadURLExternal flow) |
| No Slack signature check, retry storms | HMAC and retry filter |
| HTTP nodes sent the literal text `Bearer {{ $env... }}` (missing `=`) | Fixed |
| Two overlapping workflows | Old direct workflow archived in `archive/` |
| No error alerts | `error-notifier-workflow.json` (must be selected in the main workflow's Settings, "Error workflow") |
| Vague requests wasted money | Intake gate (6 questions) |
| Cost and margin claims ($0.05 draft, 99% margin, $1,499+ retainer) | Unverified. Treat as ideas |

## 5. Status against the Implementation Plan PDF
(`IMplimentation_Plan.pdf`, produced by Antigravity/Gemini, waiting for the reply "Approved, proceed to build". **Do not send that reply**: Antigravity would rewrite the tested files.)

Done: dead buttons, real QA and retry, copy passthrough, permanent images, HMAC and retry filter, archive of old flow, error trigger workflow, intake gate.
Partial: multi-client brain (from files, rebuild needed to add a client; not Google Sheets or Supabase), campaign state and audit (static data and usage counter, no Google Sheet log, no token cost), second QA failure (plan says regenerate without baked-in text; current behavior posts with a visible warning).
Not done: **fashion photo mode** (real product photo placed into the design), image provider router (Gemini or FLUX), separate Art Director and Copywriter agents, Google Sheets audit log.

## 6. Files
```
slack-design-agent-2stage-workflow.json   main workflow (GENERATED, 62 nodes incl. test-mode switches). Import this.
error-notifier-workflow.json              optional failure alerts to Slack
client-brain/apex_athletics_brain.json    sample client
client-brain/maria_b_brain.json           Maria B study brain (ASSUMED colors/tone, public facts from Wikipedia)
client-brain/client-memory-schema.json    brain schema
src/code/*.js                             source of every Code node
src/shared/intake_options.json            platforms, goals, photo options for the intake form
tools/build_workflow.py                   rebuilds the workflow JSON
tests/run_tests.mjs                       74 checks on the Code nodes (mocked n8n)
archive/                                  old direct workflow (do not import)
start-n8n.bat / .ps1                      launch n8n with .env and the flags the workflow needs
.env.example                              copy to .env and fill in keys
docs/system-architecture.md               flowchart
docs/PROJECT_HANDOVER.md                  this file
```
Change workflow: edit `src/code/*.js`, a brain file, or `intake_options.json`, run `python3 tools/build_workflow.py` (needs Python), run `node tests\run_tests.mjs`, re-import the workflow in n8n.

## 7. Setup (Windows)
1. `copy .env.example .env`, fill `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `OPENAI_API_KEY`, `IDEOGRAM_API_KEY`. Never commit `.env`.
2. Start n8n only with `.\start-n8n.bat` (it sets `NODE_FUNCTION_ALLOW_BUILTIN=crypto` and `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, and loads `.env`).
3. In n8n delete the old workflow, import the main workflow, click **Publish** (production webhook URLs only work when published).
4. Tunnel: `cloudflared tunnel --url http://localhost:5678` (or ngrok). The URL changes on every restart, update Slack each time.
5. Slack app: bot scopes `app_mentions:read`, `chat:write`, `files:write`. Event Subscriptions URL `https://TUNNEL/webhook/slack-design-agent` with bot event `app_mention`. Interactivity URL `https://TUNNEL/webhook/slack-interactivity` (note: `slack-interactivity`, not `slack-interactive` as in the PDFs). Reinstall the app after changing scopes. Invite the bot: `/invite @THE GD AGENT`.
6. First test message: `@THE GD AGENT client: maria_b_study I need 10 social media posts` (the intake form should open from the button).

Harmless n8n console messages: `getaddrinfo ENOTFOUND telemetry.n8n.io`, `403 Instance AI is disabled`.

## 8. Owner's progress when this was written
- Done on the new laptop: `.env` created (Slack bot token, signing secret, alert channel filled; no OpenAI or Ideogram key yet), n8n owner reset and new account, old 11-node workflow archived, the 54-node workflow imported and Published, cloudflared tunnel running, Slack Event Subscriptions URL **Verified** with `app_mention`, Interactivity URL saved.
- **First live run worked up to the ack:** `@GD Bot client: maria_b_study I need 10 social media posts` got the bot's acknowledgement in the thread (signature, tunnel, mention, bot token and brain loading all confirmed). It then stops at Intake Evaluator because there is no OpenAI key.
- v4 adds **test mode** (`TEST_MODE=true` in `.env`) so the rest of the flow can be tested for free. Next: re-import the v4 workflow, add `TEST_MODE=true`, restart n8n, run the full flow (form, draft card, Approve, Edit, Discard).
- The tunnel URL changes every time cloudflared restarts. Then update both Slack URLs (Event Subscriptions must show Verified again).

- v5 fix: in test mode the intake checklist posted, but the "Answer 6 quick questions" button got **401** with reason `body could not be parsed`. n8n hands Slack's form posts (buttons, modals) over in a different shape than JSON events. `verify_signature.js` now tries every body shape and rebuilds the form encoding by hand (n8n's Code sandbox has no URLSearchParams, which was the real cause; v6) for the HMAC check (a forged signature is still rejected). The output also shows a `debug` field (raw length, content type) for diagnosis.

## 9. Known risks and limits
- Untested against live services. Most likely to need a tweak: the 3-call Slack file upload, and Slack modal payloads.
- OpenAI and Ideogram APIs need paid credit. Test mode (v4) covers this: 4 IF nodes `Test Mode? (...)` route around the 4 paid calls to `Mock ...` Code nodes that return the same response shapes. Placeholder images come from placehold.co (needs internet). Captions and the ack are marked TEST MODE so nobody mistakes them for real output.
- Static-data memory is lost if the workflow is deleted or never published. For many clients move jobs and learned rules to a database or Sheet.
- Ideogram supports `ASPECT_4_5`, `ASPECT_1_1`, `ASPECT_9_16`, `ASPECT_16_9` (checked). Urdu script inside images will render badly, keep image text Latin and put Urdu in captions.
- Fashion: AI must not draw the garments. The intake asks about real photos and the CD prompt forbids redrawing products, but the attached photo is **not yet used** in the image.
- Model prices and names in the PDFs may be outdated. Check current pricing before quoting a client.

## 10. Next steps (recommended order)
1. Run the full flow in test mode, then switch `TEST_MODE=false` with real keys and run it once for real.
2. Fashion photo mode: take the real product photo from the Slack attachment, generate only background, lighting and typography around it, and keep the product unchanged. Evaluate an image-editing model or a background-replacement API.
3. Record a 2-minute demo video (mention, form, draft, Approve) for the portfolio and the Fiverr gig.
4. Google Sheets audit log (timestamp, client, post number, tokens, QA score, cost).
5. Optional: provider router (Ideogram for text, FLUX or Gemini for photos).
6. Selling: start with a small monthly 10-post pack priced in PKR for local brands, raise price after the first clients. Do not copy the README's $1,499+ retainer.

## 11. Prompt to paste into the next chat
> I am continuing the "Slack AI Design Agency (n8n)" project. Read the attached PROJECT_HANDOVER.md first. The workflow is built (intake gate, real Vision QA, working buttons, multi-client brain, 74 passing code tests, test mode) and live-tested up to the Slack ack on my new laptop. My folder is C:\Users\LENOVO\Downloads\ai-design-agency-n8n-v3\ai-design-agency-n8n on Windows with n8n on localhost:5678. Next I want to: [live test / test mode / fashion photo mode / demo video / Google Sheets log]. Explain step by step in simple language.
