#!/usr/bin/env python3
"""Builds the n8n workflow JSON files from src/code/*.js and client-brain/*_brain.json.

Run from the project root:  python3 tools/build_workflow.py
Then import slack-design-agent-2stage-workflow.json into n8n again.
Edit a brain file or a Code node file, run this script, re-import. Nothing else to change.
"""
import glob
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


with open(os.path.join(ROOT, "src", "shared", "intake_options.json"), encoding="utf-8") as _f:
    INTAKE_OPTIONS = json.dumps(json.load(_f), ensure_ascii=False)


def code(name, mode=None):
    with open(os.path.join(ROOT, "src", "code", name + ".js"), encoding="utf-8") as f:
        text = f.read()
    if mode:
        text = text.replace("__MODE__", mode)
    return text.replace("__INTAKE_OPTIONS__", INTAKE_OPTIONS)


def load_brains():
    brains = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "client-brain", "*_brain.json"))):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        brains[data["client_id"]] = data
    return brains


nodes = []
connections = {}


def add(node):
    nodes.append(node)
    return node["name"]


def connect(src, dst, out=0):
    connections.setdefault(src, {"main": []})
    main = connections[src]["main"]
    while len(main) <= out:
        main.append([])
    main[out].append({"node": dst, "type": "main", "index": 0})


def n(name, typ, version, pos, params, **extra):
    node = {
        "parameters": params,
        "id": "n-" + name.lower().replace(" ", "-").replace("(", "").replace(")", "").replace("?", "").replace(":", "").replace("&", "and").replace(".", ""),
        "name": name,
        "type": "n8n-nodes-base." + typ,
        "typeVersion": version,
        "position": pos,
    }
    node.update(extra)
    return add(node)


def js(name, pos, file, mode=None, replace=None):
    text = code(file, mode)
    for k, v in (replace or {}).items():
        text = text.replace(k, v)
    return n(name, "code", 2, pos, {"jsCode": text})


def cond_bool(left, value=True):
    return {
        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
        "conditions": [{
            "id": "c1",
            "leftValue": left,
            "rightValue": "",
            "operator": {"type": "boolean", "operation": "true" if value else "false", "singleValue": True},
        }],
        "combinator": "and",
    }


def if_node(name, pos, left, value=True):
    return n(name, "if", 2, pos, {"conditions": cond_bool(left, value), "options": {}})


TEST_MODE_EXPR = "={{ $env.TEST_MODE === 'true' }}"


def test_switch(label, real, mock_file, if_pos, mock_pos):
    """TEST_MODE=true routes around a paid API call to a free mock with the same response shape."""
    if_name = "Test Mode? (" + label + ")"
    mock_name = "Mock " + label
    if_node(if_name, if_pos, TEST_MODE_EXPR)
    js(mock_name, mock_pos, mock_file)
    connect(if_name, mock_name, 0)
    connect(if_name, real, 1)
    return if_name, mock_name


def slack_headers():
    return {"parameters": [{"name": "Authorization", "value": "=Bearer {{ $env.SLACK_BOT_TOKEN }}"}]}


def http(name, pos, url, body=None, headers=None, retries=2, params_extra=None):
    p = {"method": "POST", "url": url, "sendHeaders": True, "headerParameters": headers or slack_headers(), "options": {}}
    if body is not None:
        p.update({"sendBody": True, "specifyBody": "json", "jsonBody": body})
    if params_extra:
        p.update(params_extra)
    extra = {}
    if retries:
        extra = {"retryOnFail": True, "maxTries": retries, "waitBetweenTries": 2000}
    return n(name, "httpRequest", 4.2, pos, p, **extra)


SLACK_BODY = "={{ JSON.stringify($json.slack_payload) }}"
OPENAI_HEADERS = {"parameters": [{"name": "Authorization", "value": "=Bearer {{ $env.OPENAI_API_KEY }}"}]}
IDEOGRAM_HEADERS = {"parameters": [{"name": "Api-Key", "value": "={{ $env.IDEOGRAM_API_KEY }}"}]}

# ---------------------------------------------------------------- Events path
n("Slack Events Webhook", "webhook", 2, [200, 300],
  {"httpMethod": "POST", "path": "slack-design-agent", "responseMode": "responseNode", "options": {"rawBody": True}})
js("Verify Slack Signature", [420, 300], "verify_signature", mode="events")
if_node("Signature Valid?", [640, 300], "={{ $json.valid }}")
n("Respond 401", "respondToWebhook", 1.1, [860, 520],
  {"respondWith": "text", "responseBody": "invalid signature", "options": {"responseCode": 401}})
if_node("Is URL Verification?", [860, 300], "={{ $json.is_challenge }}")
n("Respond Challenge", "respondToWebhook", 1.1, [1080, 200],
  {"respondWith": "text", "responseBody": "={{ $json.challenge }}", "options": {}})
n("Respond 200 OK", "respondToWebhook", 1.1, [1080, 380],
  {"respondWith": "text", "responseBody": "ok", "options": {}})
if_node("Valid Mention?", [1300, 380], "={{ $json.is_mention }}")
js("Build Ack", [1520, 300], "build_ack")
brains = load_brains()
js("Load Brain & Build Prompt", [1520, 480], "load_brain", replace={"__BRAINS__": json.dumps(brains, ensure_ascii=False)})
if_node("Within Daily Limit?", [1740, 480], "={{ $json.within_limit }}")
js("Build Limit Message", [1960, 620], "build_limit_message")
# Intake gate: extract the brief from the message, ask the client only if something important is missing.
http("Intake Evaluator", [1960, 440], "https://api.openai.com/v1/chat/completions",
     "={{ JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0, messages: [ { role: 'system', content: $json.intake_system_prompt }, { role: 'user', content: $json.intake_user_prompt } ] }) }}",
     headers=OPENAI_HEADERS)
js("Parse Intake", [2180, 440], "parse_intake")
if_node("Brief Complete?", [2400, 440], "={{ $json.complete }}")
js("Build Intake Request", [2620, 600], "build_intake_request")
js("Build CD Prompt", [2620, 360], "build_cd_prompt")
http("Creative Director", [2840, 360], "https://api.openai.com/v1/chat/completions",
     "={{ JSON.stringify({ model: 'gpt-4o', response_format: { type: 'json_object' }, temperature: 0.7, messages: [ { role: 'system', content: $json.system_prompt }, { role: 'user', content: $json.user_prompt } ] }) }}",
     headers=OPENAI_HEADERS)
js("Parse Campaign Plan", [3060, 360], "parse_plan")
INTAKE_IF, INTAKE_MOCK = test_switch("Intake", "Intake Evaluator", "mock_intake", [1960, 260], [2180, 260])
CD_IF, CD_MOCK = test_switch("Creative Director", "Creative Director", "mock_creative_director", [2840, 180], [3060, 180])

# Shared terminal node: every Code node that builds {slack_url, slack_payload} ends here.
http("Slack Notify", [2000, 1000], "={{ $json.slack_url }}", SLACK_BODY)

connect("Slack Events Webhook", "Verify Slack Signature")
connect("Verify Slack Signature", "Signature Valid?")
connect("Signature Valid?", "Is URL Verification?", 0)
connect("Signature Valid?", "Respond 401", 1)
connect("Is URL Verification?", "Respond Challenge", 0)
connect("Is URL Verification?", "Respond 200 OK", 1)
connect("Respond 200 OK", "Valid Mention?")
connect("Valid Mention?", "Build Ack", 0)
connect("Valid Mention?", "Load Brain & Build Prompt", 0)
connect("Build Ack", "Slack Notify")
connect("Load Brain & Build Prompt", "Within Daily Limit?")
connect("Within Daily Limit?", INTAKE_IF, 0)
connect("Within Daily Limit?", "Build Limit Message", 1)
connect("Build Limit Message", "Slack Notify")
connect("Intake Evaluator", "Parse Intake")
connect(INTAKE_MOCK, "Parse Intake")
connect("Parse Intake", "Brief Complete?")
connect("Brief Complete?", "Build CD Prompt", 0)
connect("Brief Complete?", "Build Intake Request", 1)
connect("Build Intake Request", "Slack Notify")
connect("Build CD Prompt", CD_IF)
connect("Creative Director", "Parse Campaign Plan")
connect(CD_MOCK, "Parse Campaign Plan")

# ----------------------------------------------------------- Interactivity path
n("Slack Interactivity Webhook", "webhook", 2, [200, 1000],
  {"httpMethod": "POST", "path": "slack-interactivity", "responseMode": "responseNode", "options": {"rawBody": True}})
js("Verify Slack Signature (Interactivity)", [420, 1000], "verify_signature", mode="interactivity")
if_node("Interactivity Signature Valid?", [640, 1000], "={{ $json.valid }}")
n("Respond 200 (Interactivity)", "respondToWebhook", 1.1, [860, 1000], {"respondWith": "noData", "options": {}})
js("Route Action", [1080, 1000], "route_action")


def rule(key):
    return {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"id": "r-" + key, "leftValue": "={{ $json.route }}", "rightValue": key,
                            "operator": {"type": "string", "operation": "equals"}}],
            "combinator": "and",
        },
        "renameOutput": True,
        "outputKey": key,
    }


n("Action Router", "switch", 3, [1300, 1000],
  {"rules": {"values": [rule("approve"), rule("discard"), rule("edit_open"), rule("edit_submit"),
                        rule("intake_open"), rule("intake_submit")]}, "options": {}})
js("Build Intake Modal", [1540, 1520], "build_intake_modal")
js("Handle Intake Submit", [1540, 1680], "handle_intake_submit")
if_node("Intake Blocked?", [1780, 1680], "={{ $json.blocked }}")
js("Build Intake Thanks", [2000, 1760], "build_intake_thanks")
js("Handle Approve", [1540, 840], "handle_approve")
js("Handle Discard", [1540, 1040], "handle_discard")
js("Build Edit Modal", [1540, 1200], "build_edit_modal")
js("Handle Edit Submit", [1540, 1360], "handle_edit_submit")
if_node("Action Blocked?", [1780, 1100], "={{ $json.blocked }}")
js("Build Progress Notice", [2000, 1200], "build_progress_notice")

connect("Slack Interactivity Webhook", "Verify Slack Signature (Interactivity)")
connect("Verify Slack Signature (Interactivity)", "Interactivity Signature Valid?")
connect("Interactivity Signature Valid?", "Respond 200 (Interactivity)", 0)
connect("Interactivity Signature Valid?", "Respond 401", 1)
connect("Respond 200 (Interactivity)", "Route Action")
connect("Route Action", "Action Router")
connect("Action Router", "Handle Approve", 0)
connect("Action Router", "Handle Discard", 1)
connect("Action Router", "Build Edit Modal", 2)
connect("Action Router", "Handle Edit Submit", 3)
connect("Action Router", "Build Intake Modal", 4)
connect("Action Router", "Handle Intake Submit", 5)
connect("Build Intake Modal", "Slack Notify")
connect("Handle Intake Submit", "Intake Blocked?")
connect("Intake Blocked?", "Slack Notify", 0)
connect("Intake Blocked?", "Build CD Prompt", 1)
connect("Intake Blocked?", "Build Intake Thanks", 1)
connect("Build Intake Thanks", "Slack Notify")
connect("Handle Discard", "Slack Notify")
connect("Build Edit Modal", "Slack Notify")
connect("Handle Approve", "Action Blocked?")
connect("Handle Edit Submit", "Action Blocked?")
connect("Action Blocked?", "Slack Notify", 0)
connect("Action Blocked?", "Post Queue Loop", 1)
connect("Action Blocked?", "Build Progress Notice", 1)
connect("Build Progress Notice", "Slack Notify")

# ------------------------------------------------------------ Render pipeline
n("Post Queue Loop", "splitInBatches", 3, [2400, 700], {"batchSize": 1, "options": {}})
js("Render Input", [2620, 700], "render_input")
http("Render Image (Ideogram v2)", [2840, 700], "https://api.ideogram.ai/generate",
     "={{ JSON.stringify({ image_request: { prompt: $json.art_prompt, aspect_ratio: $json.aspect_ratio, model: 'V_2', magic_prompt_option: 'OFF' } }) }}",
     headers=IDEOGRAM_HEADERS)
js("Collect Render Result", [3060, 700], "collect_render")
http("Vision QA Inspector", [3280, 700], "https://api.openai.com/v1/chat/completions",
     "={{ JSON.stringify({ model: 'gpt-4o', response_format: { type: 'json_object' }, temperature: 0, messages: [ { role: 'system', content: $json.qa_system_prompt }, { role: 'user', content: [ { type: 'text', text: 'Inspect this image.' }, { type: 'image_url', image_url: { url: $json.image_url } } ] } ] }) }}",
     headers=OPENAI_HEADERS)
js("Evaluate QA", [3500, 700], "evaluate_qa")
RENDER_IF, RENDER_MOCK = test_switch("Render", "Render Image (Ideogram v2)", "mock_render", [2840, 540], [3060, 540])
QA_IF, QA_MOCK = test_switch("Vision QA", "Vision QA Inspector", "mock_vision_qa", [3280, 540], [3500, 540])
if_node("QA OK or Out of Retries?", [3720, 700], "={{ $json.proceed }}")
js("Build Retry Prompt", [3720, 920], "build_retry")
n("Download Image", "httpRequest", 4.2, [3940, 700],
  {"method": "GET", "url": "={{ $json.image_url }}",
   "options": {"response": {"response": {"responseFormat": "file", "outputPropertyName": "data"}}}},
  retryOnFail=True, maxTries=2, waitBetweenTries=2000)
js("Prepare Slack Upload", [4160, 700], "prepare_upload")
http("Slack: Get Upload URL", [4380, 700], "https://slack.com/api/files.getUploadURLExternal", None,
     params_extra={"sendBody": True, "contentType": "form-urlencoded", "specifyBody": "keypair",
                   "bodyParameters": {"parameters": [
                       {"name": "filename", "value": "={{ $json.filename }}"},
                       {"name": "length", "value": "={{ $json.file_length }}"}]}})
js("Attach Image & Upload URL", [4600, 700], "attach_upload")
n("Slack: Upload File", "httpRequest", 4.2, [4820, 700],
  {"method": "POST", "url": "={{ $json.upload_url }}", "sendBody": True, "contentType": "binaryData",
   "inputDataFieldName": "data", "options": {}},
  retryOnFail=True, maxTries=2, waitBetweenTries=2000)
http("Slack: Complete Upload", [5040, 700], "https://slack.com/api/files.completeUploadExternal",
     "={{ JSON.stringify({ files: [ { id: $('Attach Image & Upload URL').last().json.file_id, title: $('Attach Image & Upload URL').last().json.headline } ], channel_id: $('Attach Image & Upload URL').last().json.channel, thread_ts: $('Attach Image & Upload URL').last().json.thread_ts, initial_comment: '*Post ' + $('Attach Image & Upload URL').last().json.post_index + ' of ' + $('Attach Image & Upload URL').last().json.total + '*' }) }}")
js("Build Delivery Message", [5260, 700], "build_delivery")
http("Slack Post (Pipeline)", [5480, 700], "={{ $json.slack_url }}", SLACK_BODY)
if_node("Is Batch Item?", [5700, 700], "={{ $('Build Delivery Message').last().json.mode === 'batch' }}")
js("Build Batch Complete", [2620, 500], "build_batch_complete")

# Both entry points (stage 1 draft, stage 2 batch/revision) feed the same loop.
connect("Parse Campaign Plan", "Post Queue Loop")
connect("Post Queue Loop", "Build Batch Complete", 0)
connect("Post Queue Loop", "Render Input", 1)
connect("Build Batch Complete", "Slack Notify")
connect("Render Input", RENDER_IF)
connect("Render Image (Ideogram v2)", "Collect Render Result")
connect(RENDER_MOCK, "Collect Render Result")
connect("Collect Render Result", QA_IF)
connect("Vision QA Inspector", "Evaluate QA")
connect(QA_MOCK, "Evaluate QA")
connect("Evaluate QA", "QA OK or Out of Retries?")
connect("QA OK or Out of Retries?", "Download Image", 0)
connect("QA OK or Out of Retries?", "Build Retry Prompt", 1)
connect("Build Retry Prompt", "Render Input")
connect("Download Image", "Prepare Slack Upload")
connect("Prepare Slack Upload", "Slack: Get Upload URL")
connect("Slack: Get Upload URL", "Attach Image & Upload URL")
connect("Attach Image & Upload URL", "Slack: Upload File")
connect("Slack: Upload File", "Slack: Complete Upload")
connect("Slack: Complete Upload", "Build Delivery Message")
connect("Build Delivery Message", "Slack Post (Pipeline)")
connect("Slack Post (Pipeline)", "Is Batch Item?")
connect("Is Batch Item?", "Post Queue Loop", 0)

workflow = {
    "name": "AI Design Agency (Slack, 2-stage, Vision QA)",
    "nodes": nodes,
    "connections": connections,
    "active": False,
    "settings": {"executionOrder": "v1"},
    "tags": [],
}
with open(os.path.join(ROOT, "slack-design-agent-2stage-workflow.json"), "w", encoding="utf-8") as f:
    json.dump(workflow, f, indent=2, ensure_ascii=False)

# ------------------------------------------------------------- Error notifier
err_nodes = [
    {"parameters": {}, "id": "e-trigger", "name": "Error Trigger", "type": "n8n-nodes-base.errorTrigger",
     "typeVersion": 1, "position": [200, 300]},
    {"parameters": {
        "method": "POST", "url": "https://slack.com/api/chat.postMessage", "sendHeaders": True,
        "headerParameters": slack_headers(), "sendBody": True, "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ channel: $env.SLACK_ALERT_CHANNEL, text: ':rotating_light: Workflow failed: ' + $json.workflow.name + ' | node: ' + ($json.execution.lastNodeExecuted || 'unknown') + ' | ' + (($json.execution.error && $json.execution.error.message) || 'no message') + ' | ' + ($json.execution.url || '') }) }}",
        "options": {}},
     "id": "e-slack", "name": "Alert Slack", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [440, 300]},
]
err = {
    "name": "AI Design Agency - Error Notifier",
    "nodes": err_nodes,
    "connections": {"Error Trigger": {"main": [[{"node": "Alert Slack", "type": "main", "index": 0}]]}},
    "active": False,
    "settings": {"executionOrder": "v1"},
    "tags": [],
}
with open(os.path.join(ROOT, "error-notifier-workflow.json"), "w", encoding="utf-8") as f:
    json.dump(err, f, indent=2, ensure_ascii=False)

print(f"Built {len(nodes)} nodes, {len(brains)} client brains: {', '.join(brains)}")
