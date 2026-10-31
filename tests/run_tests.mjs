// Runs the Code nodes of the BUILT workflow with mocked n8n globals and walks through a full scenario.
// Usage (from project root): node tests/run_tests.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const wf = JSON.parse(fs.readFileSync(new URL('../slack-design-agent-2stage-workflow.json', import.meta.url)));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const staticData = {};
const outputs = {}; // last output of each node: [{json, binary}]
const env = { SLACK_SIGNING_SECRET: 'testsecret' };
let binaryBuffer = Buffer.from('fake-image-bytes');

function run(name, inputJson, { binary } = {}) {
  const node = wf.nodes.find((n) => n.name === name);
  assert.ok(node, 'missing node ' + name);
  const items = Array.isArray(inputJson) ? inputJson : [inputJson];
  const input = items.map((j) => ({ json: j, binary }));
  const $input = { first: () => input[0], all: () => input };
  const $ = (n) => {
    const out = outputs[n];
    if (!out) throw new Error(`node "${n}" has not run yet (referenced from "${name}")`);
    return { last: () => out[out.length - 1], first: () => out[0], all: () => out };
  };
  // n8n's task-runner sandbox has no URLSearchParams / URL: hide them so the tests catch that.
  const fn = new AsyncFunction('$input', '$', '$env', '$getWorkflowStaticData', 'require', 'URLSearchParams', 'URL', node.parameters.jsCode);
  const ctx = { helpers: { getBinaryDataBuffer: async () => binaryBuffer } };
  return fn.call(ctx, $input, $, env, () => staticData, require, undefined, undefined).then((res) => {
    outputs[name] = res;
    return res;
  });
}
const j = (res) => res[0].json;
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log('  ok  ' + msg); };

// ---------- 1. Slack signature
console.log('Signature');
const eventBody = JSON.stringify({
  type: 'event_callback',
  event: { type: 'app_mention', channel: 'C1', ts: '111.1', user: 'U1', text: '<@UBOT> client: maria_b_study Plan 10 posts for the winter wedding season' },
});
const sign = (raw, ts) => 'v0=' + crypto.createHmac('sha256', env.SLACK_SIGNING_SECRET).update(`v0:${ts}:${raw}`).digest('hex');
const ts = String(Math.floor(Date.now() / 1000));
const goodHeaders = { 'x-slack-request-timestamp': ts, 'x-slack-signature': sign(eventBody, ts) };
binaryBuffer = Buffer.from(eventBody);
let r = await run('Verify Slack Signature', { headers: goodHeaders });
ok(j(r).valid === true && j(r).is_mention === true, 'valid signature accepted, mention detected');
r = await run('Verify Slack Signature', { headers: { ...goodHeaders, 'x-slack-signature': 'v0=bad' } });
ok(j(r).valid === false, 'bad signature rejected');
r = await run('Verify Slack Signature', { headers: { ...goodHeaders, 'x-slack-retry-num': '1' } });
ok(j(r).is_mention === false, 'Slack retry is ignored');
const oldTs = String(Math.floor(Date.now() / 1000) - 4000);
r = await run('Verify Slack Signature', { headers: { 'x-slack-request-timestamp': oldTs, 'x-slack-signature': sign(eventBody, oldTs) } });
ok(j(r).valid === false, 'old timestamp rejected');
const challengeRaw = JSON.stringify({ type: 'url_verification', challenge: 'abc123' });
binaryBuffer = Buffer.from(challengeRaw);
r = await run('Verify Slack Signature', { headers: { 'x-slack-request-timestamp': ts, 'x-slack-signature': sign(challengeRaw, ts) } });
ok(j(r).is_challenge && j(r).challenge === 'abc123', 'URL verification challenge parsed');


// ---------- 1b. Intake gate (questions before design)
console.log('Intake gate');
const mkEvent = (text, extra = {}) => ({ body: { event: { type: 'app_mention', channel: 'C1', ts: '500.5', text: '<@UBOT> ' + text, ...extra } } });
const nullBrief = { platform: null, objective: null, product_focus: null, audience: null, visual_style: null, assets: null };
r = await run('Load Brain & Build Prompt', mkEvent('client: maria_b_study I need 10 social media posts'));
const vctx = j(r);
ok(vctx.intake_system_prompt.includes('ig_feed_4x5') && vctx.skip_intake === false, 'intake prompt lists the allowed platforms');
r = await run('Parse Intake', { choices: [{ message: { content: JSON.stringify({ ...nullBrief, platform: 'tiktok' }) } }] });
ok(j(r).complete === false && j(r).brief.platform === null, 'made-up platform from the model is rejected in code');
ok(['platform', 'objective', 'product_focus', 'assets'].every((m) => j(r).missing.includes(m)), 'vague request: platform, goal, product and photos are asked');
ok(staticData.jobs[vctx.job_id].status === 'awaiting_intake', 'job waits for the answers');
r = await run('Build Intake Request', j(r));
const reqBlocks = r[0].json.slack_payload.blocks;
ok(reqBlocks[1].text.text.includes('not stated') && reqBlocks[2].elements[0].value === vctx.job_id, 'checklist and button posted');
r = await run('Route Action', { payload: { type: 'block_actions', trigger_id: 'T9', user: { id: 'U9' }, channel: { id: 'C1' }, container: { message_ts: '1' }, actions: [{ action_id: 'btn_intake_open', value: vctx.job_id }] } });
ok(j(r).route === 'intake_open', 'button routed to the form');
r = await run('Build Intake Modal', j(r));
const view = j(r).slack_payload.view;
ok(view.callback_id === 'intake_modal' && view.blocks.length === 6 && j(r).slack_url.endsWith('views.open'), 'form with 6 questions opens');
const sel = (v) => ({ value: { selected_option: { value: v } } });
const txt = (v) => ({ value: { value: v } });
const intakeSubmit = { type: 'view_submission', user: { id: 'U9' }, view: { callback_id: 'intake_modal', private_metadata: vctx.job_id, state: { values: {
  platform_block: sel('story_9x16'), objective_block: sel('festival_event'), product_block: txt('Winter Mbroidered'),
  audience_block: txt(''), style_block: txt('jewel tones'), assets_block: sel('will_attach') } } } };
r = await run('Route Action', { payload: intakeSubmit });
ok(j(r).route === 'intake_submit' && j(r).brief.platform === 'story_9x16' && j(r).brief.assets === 'will_attach', 'form answers parsed');
const submitItem = j(r);
r = await run('Handle Intake Submit', submitItem);
ok(j(r).blocked === false && staticData.jobs[vctx.job_id].status === 'planning', 'answers saved, planning starts');
const okItem = j(r);
r = await run('Build Intake Thanks', okItem);
ok(j(r).slack_payload.text.includes('Story or Reel cover'), 'brief confirmed back to the client');
r = await run('Build CD Prompt', okItem);
ok(j(r).system_prompt.includes('9:16') && j(r).system_prompt.includes('Winter Mbroidered') && staticData.jobs[vctx.job_id].aspect_ratio === 'ASPECT_9_16', 'story size reaches the CD prompt and image size');
ok(j(r).system_prompt.includes('NEVER draw, redraw'), 'attached photos: AI must not redraw the product');
r = await run('Handle Intake Submit', submitItem);
ok(j(r).blocked === true, 'double submit is blocked');
r = await run('Handle Intake Submit', { ...submitItem, brief: { ...submitItem.brief, platform: 'tiktok' } });
ok(j(r).blocked === true, 'invalid answers are blocked');

r = await run('Load Brain & Build Prompt', mkEvent('client: apex_athletics --quick make posts'));
ok(j(r).skip_intake === true && !j(r).intake_user_prompt.includes('--quick'), '--quick flag detected and removed');
r = await run('Parse Intake', { choices: [{ message: { content: JSON.stringify(nullBrief) } }] });
ok(j(r).complete === true && staticData.jobs[j(r).job_id].brief.platform === 'ig_feed_4x5', '--quick skips the questions with safe defaults');
r = await run('Load Brain & Build Prompt', mkEvent('client: maria_b_study posts for Eid, 4:5 feed', { files: [{ id: 'F1' }] }));
r = await run('Parse Intake', { choices: [{ message: { content: JSON.stringify({ ...nullBrief, platform: 'ig_feed_4x5', objective: 'festival_event', product_focus: 'Eid lawn' }) } }] });
ok(j(r).complete === true && staticData.jobs[j(r).job_id].brief.assets === 'will_attach', 'attached file counts as real photos');
r = await run('Load Brain & Build Prompt', mkEvent('client: apex_athletics posts for the new tee, launch, instagram feed'));
r = await run('Parse Intake', { choices: [{ message: { content: JSON.stringify({ ...nullBrief, platform: 'ig_feed_4x5', objective: 'product_launch', product_focus: 'Carbon Core tee' }) } }] });
ok(j(r).complete === true, 'non-fashion client does not need the photo answer');

// ---------- 2. Stage 1
console.log('Stage 1: brain, plan, render, QA');
binaryBuffer = Buffer.from(eventBody);
const verified = await run('Verify Slack Signature', { headers: goodHeaders });
r = await run('Build Ack', j(verified));
ok(r[0].json.slack_payload.thread_ts === '111.1', 'ack goes to the thread');
r = await run('Load Brain & Build Prompt', j(verified));
const ctx = j(r);
ok(ctx.client_id === 'maria_b_study' && ctx.within_limit, 'client chosen from "client:" tag');
ok(staticData.jobs[ctx.job_id].brain_prompt.includes('Maria.B.') && !ctx.intake_user_prompt.includes('client:'), 'brain in prompt, tag removed from request');
ok(staticData.jobs[ctx.job_id].status === 'intake', 'job created');
// complete brief given in the first message -> no questions
const fullBrief = { platform: 'ig_feed_4x5', objective: 'festival_event', product_focus: 'Winter Mbroidered', audience: null, visual_style: null, assets: 'none' };
r = await run('Parse Intake', { choices: [{ message: { content: JSON.stringify(fullBrief) } }] });
ok(j(r).complete === true && staticData.jobs[ctx.job_id].status === 'planning', 'complete brief skips the questions');
r = await run('Build CD Prompt', j(r));
ok(j(r).system_prompt.includes('4:5 portrait') && j(r).system_prompt.includes('Winter Mbroidered') && j(r).system_prompt.includes('PRODUCT INTEGRITY'), 'CD prompt has size, product and fashion rule');
ok(staticData.jobs[ctx.job_id].aspect_ratio === 'ASPECT_4_5', 'image size saved from the brief');

const gptPlan = {
  campaign_theme: 'Winter wedding',
  posts: Array.from({ length: 10 }, (_, i) => ({
    headline_text: `Velvet Dreams ${i + 1}`,
    art_direction_prompt: `Luxury winter wedding scene ${i + 1}`,
    caption: `Caption ${i + 1}`,
    hashtags: '#MariaB',
  })),
};
r = await run('Parse Campaign Plan', { choices: [{ message: { content: JSON.stringify(gptPlan) } }] });
let item = j(r);
ok(item.mode === 'draft' && item.post_index === 1 && item.total === 10, 'Post 1 emitted as draft');
ok(item.art_prompt.includes('"Velvet Dreams 1"'), 'headline forced into image prompt');
await assert.rejects(() => run('Parse Campaign Plan', { choices: [{ message: { content: 'not json' } }] }), /invalid JSON/);
ok(true, 'invalid Creative Director JSON throws a clear error');
r = await run('Parse Campaign Plan', { choices: [{ message: { content: JSON.stringify(gptPlan) } }] });
item = j(r);

r = await run('Render Input', item);
r = await run('Collect Render Result', { data: [{ url: 'https://img/1.png' }] });
ok(staticData.usage.maria_b_study[new Date().toISOString().slice(0, 10)] === 1, 'image usage counted');
await assert.rejects(() => run('Collect Render Result', { error: 'x' }), /no image/);
r = await run('Collect Render Result', { data: [{ url: 'https://img/1.png' }] });

const qaBad = { detected_text: 'VELVET DREEMS 1', legibility_score: 95, is_blurry: false, has_distortion: false, violates_banned_elements: false, pass: true, critique: 'typo' };
r = await run('Evaluate QA', { choices: [{ message: { content: JSON.stringify(qaBad) } }] });
ok(j(r).qa_pass === false && j(r).proceed === false, 'misspelled headline FAILS even though the model said pass:true');
r = await run('Build Retry Prompt', j(r));
let retry = j(r);
ok(retry.attempt === 2 && retry.art_prompt.includes('IMPORTANT corrections'), 'retry prompt carries QA feedback');
r = await run('Render Input', retry);
r = await run('Collect Render Result', { data: [{ url: 'https://img/2.png' }] });
const qaGood = { detected_text: 'Velvet Dreams 1', legibility_score: 91, is_blurry: false, has_distortion: false, violates_banned_elements: false, pass: true, critique: '' };
r = await run('Evaluate QA', { choices: [{ message: { content: JSON.stringify(qaGood) } }] });
ok(j(r).qa_pass && j(r).proceed && j(r).qa.score === 91, 'good image passes with the real score');

// out-of-retries: attempt 3 with a bad image must proceed
const stuck = { ...j(r), attempt: 3 };
outputs['Collect Render Result'] = [{ json: { ...stuck, headline: 'Velvet Dreams 1' } }];
const stuckRes = await run('Evaluate QA', { choices: [{ message: { content: JSON.stringify(qaBad) } }] });
ok(j(stuckRes).qa_pass === false && j(stuckRes).proceed === true, 'after max retries the draft proceeds with a visible warning');
// restore the good path
outputs['Collect Render Result'] = [{ json: { ...j(r), attempt: 2 } }];
outputs['Evaluate QA'] = r;

console.log('Stage 1: upload and delivery');
r = await run('Prepare Slack Upload', { ok: true }, { binary: { data: { mimeType: 'image/png' } } });
ok(j(r).file_length === binaryBuffer.length && j(r).filename.endsWith('post1.png'), 'upload size and filename computed');
outputs['Download Image'] = [{ json: {}, binary: { data: { mimeType: 'image/png' } } }];
r = await run('Attach Image & Upload URL', { ok: true, upload_url: 'https://up/1', file_id: 'F1' });
ok(j(r).file_id === 'F1' && r[0].binary, 'binary and upload URL re-attached');
await assert.rejects(() => run('Attach Image & Upload URL', { ok: false, error: 'invalid_auth' }), /invalid_auth/);
r = await run('Attach Image & Upload URL', { ok: true, upload_url: 'https://up/1', file_id: 'F1' });
r = await run('Build Delivery Message', { ok: true });
let card = j(r).slack_payload;
ok(j(r).mode === 'draft' && card.blocks.find((b) => b.type === 'actions').elements.length === 3, 'review card has 3 buttons');
ok(card.blocks[1].elements[0].text.includes('passed') && card.blocks[1].elements[0].text.includes('91/100'), 'card shows REAL QA result');
ok(card.blocks.find((b) => b.type === 'actions').elements[0].value === ctx.job_id, 'buttons carry the job id');
ok(staticData.jobs[ctx.job_id].status === 'awaiting_review', 'job waits for review');

// ---------- 3. Stage 2: buttons
console.log('Stage 2: buttons');
const clickForm = (actionId, extra = {}) =>
  new URLSearchParams({ payload: JSON.stringify({ type: 'block_actions', trigger_id: 'T1', user: { id: 'U9' }, channel: { id: 'C1' }, container: { message_ts: '222.2' }, actions: [{ action_id: actionId, value: ctx.job_id }], ...extra }) }).toString();
const rawClick = clickForm('btn_request_edit');
const tsC = String(Math.floor(Date.now() / 1000));
binaryBuffer = Buffer.from(rawClick);
r = await run('Verify Slack Signature (Interactivity)', { headers: { 'x-slack-request-timestamp': tsC, 'x-slack-signature': sign(rawClick, tsC) } });
ok(j(r).valid && j(r).payload.type === 'block_actions', 'interactivity payload verified and parsed');
{
  // n8n may not keep the raw form body: payload only in json.body, or raw already decoded
  const payloadObj = JSON.parse(new URLSearchParams(rawClick).get('payload'));
  const pText = JSON.stringify(payloadObj);
  const formStd = new URLSearchParams({ payload: pText }).toString();
  const h = { 'x-slack-request-timestamp': tsC, 'x-slack-signature': sign(formStd, tsC) };
  binaryBuffer = Buffer.from('');
  const a = await run('Verify Slack Signature (Interactivity)', { headers: h, body: { payload: pText } });
  ok(j(a).valid && j(a).payload.type === 'block_actions', 'form body without raw copy: parsed and signature rebuilt');
  binaryBuffer = Buffer.from('payload=' + pText);
  const b = await run('Verify Slack Signature (Interactivity)', { headers: h, body: {} });
  ok(j(b).valid && j(b).payload.actions[0].action_id === 'btn_request_edit', 'already-decoded raw body: parsed and signature rebuilt');
  const c = await run('Verify Slack Signature (Interactivity)', { headers: { ...h, 'x-slack-signature': 'v0=forged' }, body: { payload: pText } });
  ok(j(c).valid === false && j(c).reason === 'signature mismatch', 'forged button click still rejected');
  binaryBuffer = Buffer.from(rawClick);
  await run('Verify Slack Signature (Interactivity)', { headers: { 'x-slack-request-timestamp': tsC, 'x-slack-signature': sign(rawClick, tsC) } });
}
r = await run('Route Action', j(r));
ok(j(r).route === 'edit_open' && j(r).job_id === ctx.job_id, 'Request Edit routed');
r = await run('Build Edit Modal', j(r));
ok(j(r).slack_url.endsWith('views.open') && j(r).slack_payload.view.callback_id === 'edit_modal', 'edit modal opens');

const submit = { type: 'view_submission', user: { id: 'U9' }, view: { callback_id: 'edit_modal', private_metadata: ctx.job_id, state: { values: { notes_block: { notes_input: { value: 'More embroidery detail' } } } } } };
r = await run('Route Action', { payload: submit });
ok(j(r).route === 'edit_submit' && j(r).notes === 'More embroidery detail', 'modal submit routed with notes');
r = await run('Handle Edit Submit', j(r));
ok(j(r).blocked === false && j(r).art_prompt.includes('More embroidery detail') && j(r).mode === 'draft', 'revision queued as new draft');
r = await run('Build Progress Notice', r.map((x) => x.json));
ok(j(r).slack_payload.text.includes('More embroidery detail'), 'revision notice posted');
ok(staticData.learned.maria_b_study.length === 1, 'feedback saved to client brain (learned rules)');
r = await run('Handle Edit Submit', { route: 'edit_submit', job_id: ctx.job_id, notes: 'again', user_id: 'U9', channel: 'C1' });
ok(j(r).blocked === true, 'second edit while revising is blocked');

// next job for the same client sees the learned rule
const mention2 = { body: { event: { type: 'app_mention', channel: 'C2', ts: '333.3', text: '<@UBOT> maria b eid campaign' } } };
r = await run('Load Brain & Build Prompt', mention2);
ok(j(r).client_id === 'maria_b_study' && staticData.jobs[j(r).job_id].brain_prompt.includes('More embroidery detail'), 'alias match + learned rule used in next prompt');
r = await run('Load Brain & Build Prompt', { body: { event: { type: 'app_mention', channel: 'C2', ts: '3', text: 'apex athletics launch' } } });
ok(j(r).client_id === 'apex_athletics', 'second client selected by alias');

// finish the revision draft then approve
staticData.jobs[ctx.job_id].status = 'awaiting_review';
r = await run('Handle Approve', { route: 'approve', job_id: ctx.job_id, user_id: 'U9', channel: 'C1', message_ts: '222.2' });
ok(r.length === 9 && r.every((x) => x.json.mode === 'batch' && !x.json.blocked), 'approve queues posts 2-10');
ok(r[0].json.post_index === 2 && r[8].json.post_index === 10, 'posts are 2..10 in order');
const notice = await run('Build Progress Notice', r.map((x) => x.json));
ok(j(notice).slack_url.endsWith('chat.update') && j(notice).slack_payload.blocks[0].text.text.includes('Approved'), 'approve replaces the card (no more buttons)');
r = await run('Handle Approve', { route: 'approve', job_id: ctx.job_id, user_id: 'U9', channel: 'C1', message_ts: '222.2' });
ok(r.length === 1 && r[0].json.blocked, 'double click on Approve is blocked');

outputs['Attach Image & Upload URL'] = [{ json: { job_id: ctx.job_id, mode: 'batch', channel: 'C1', thread_ts: '111.1', headline: 'Velvet Dreams 2', post_index: 2, total: 10, caption: 'Cap', hashtags: '#x', attempt: 1, qa: { pass: false, score: 60, detected_text: 'x', problems: ['blurry'] } } }];
r = await run('Build Delivery Message', { ok: true });
ok(j(r).mode === 'batch' && j(r).slack_payload.text.includes('did not fully pass'), 'batch caption shows QA warning');
r = await run('Build Batch Complete', { done: true });
ok(j(r).slack_payload.text.includes('1 image(s) did not fully pass'), 'final message counts QA warnings');

// limits
console.log('Cost guard');
staticData.usage.maria_b_study[new Date().toISOString().slice(0, 10)] = 40;
r = await run('Load Brain & Build Prompt', mention2);
ok(j(r).within_limit === false, 'daily limit blocks new jobs');
r = await run('Build Limit Message', j(r));
ok(j(r).slack_payload.text.includes('limit'), 'limit message built');

// discard
staticData.jobs[ctx.job_id].status = 'awaiting_review';
r = await run('Handle Discard', { job_id: ctx.job_id, user_id: 'U9', channel: 'C1', message_ts: '222.2' });
ok(staticData.jobs[ctx.job_id].status === 'discarded' && j(r).slack_url.endsWith('chat.update'), 'discard stops the job and updates the card');

// ---------- 4. Test mode (TEST_MODE=true): free mocks with the same response shapes
console.log('Test mode');
const conn = wf.connections;
const outs = (n, i) => ((conn[n] && conn[n].main[i]) || []).map((c) => c.node);
for (const [label, real, next] of [['Intake', 'Intake Evaluator', 'Parse Intake'], ['Creative Director', 'Creative Director', 'Parse Campaign Plan'], ['Render', 'Render Image (Ideogram v2)', 'Collect Render Result'], ['Vision QA', 'Vision QA Inspector', 'Evaluate QA']]) {
  const iff = `Test Mode? (${label})`;
  assert.ok(outs(iff, 0).includes('Mock ' + label) && outs(iff, 1).includes(real) && outs('Mock ' + label, 0).includes(next) && outs(real, 0).includes(next), 'wiring ' + label);
}
ok(outs('Within Daily Limit?', 0)[0] === 'Test Mode? (Intake)' && outs('Render Input', 0)[0] === 'Test Mode? (Render)', 'all 4 paid calls have a test-mode switch');
env.TEST_MODE = 'true';
r = await run('Build Ack', { body: { event: { channel: 'C7', ts: '7.7' } } });
ok(j(r).slack_payload.text.includes('TEST MODE'), 'ack says TEST MODE');
delete staticData.usage.maria_b_study;
r = await run('Load Brain & Build Prompt', mkEvent('client: maria_b_study I need 10 social media posts'));
r = await run('Mock Intake', j(r));
r = await run('Parse Intake', j(r));
ok(j(r).complete === false && j(r).missing.includes('platform'), 'mock intake: vague request still opens the form');
r = await run('Load Brain & Build Prompt', mkEvent('client: maria_b_study instagram feed posts for the eid lawn collection, no photos'));
const tctx = j(r);
r = await run('Mock Intake', tctx);
r = await run('Parse Intake', j(r));
ok(j(r).complete === true && staticData.jobs[tctx.job_id].brief.product_focus === 'eid lawn collection', 'mock intake: clear request skips the form');
r = await run('Build CD Prompt', { job_id: tctx.job_id });
r = await run('Mock Creative Director', j(r));
r = await run('Parse Campaign Plan', j(r));
let titem = j(r);
ok(titem.total === 10 && titem.caption.startsWith('[TEST MODE]'), 'mock plan: 10 posts, captions marked TEST MODE');
r = await run('Render Input', titem);
r = await run('Mock Render', j(r));
ok(j(r).data[0].url.startsWith('https://placehold.co/1080x1350/') && j(r).data[0].url.includes('THE%20NEW%20EDIT'), 'mock image: right size, headline printed');
r = await run('Collect Render Result', j(r));
r = await run('Mock Vision QA', j(r));
r = await run('Evaluate QA', j(r));
ok(j(r).qa_pass && j(r).proceed, 'mock QA passes through the real QA rules');
env.TEST_MODE_QA_FAIL_FIRST = 'true';
r = await run('Mock Vision QA', outputs['Collect Render Result'][0].json);
r = await run('Evaluate QA', j(r));
ok(j(r).qa_pass === false && j(r).proceed === false, 'TEST_MODE_QA_FAIL_FIRST triggers one retry');
delete env.TEST_MODE; delete env.TEST_MODE_QA_FAIL_FIRST;

console.log(`\nAll ${passed} checks passed.`);
