// Loads the client brain, applies learned rules, checks the daily image limit,
// creates a job and prepares the intake (brief extraction) prompts.
// The build script replaces __BRAINS__ and __INTAKE_OPTIONS__.
const BRAINS = __BRAINS__;
const OPTIONS = __INTAKE_OPTIONS__;

const e = $input.first().json.body.event;
const sd = $getWorkflowStaticData('global');
sd.jobs = sd.jobs || {};
sd.learned = sd.learned || {};
sd.usage = sd.usage || {};

const now = Date.now();
for (const [k, j] of Object.entries(sd.jobs)) {
  if (now - j.created > 14 * 86400 * 1000) delete sd.jobs[k];
}

let text = (e.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
let clientId = null;
const tag = text.match(/client:\s*([a-z0-9_-]+)/i);
if (tag) {
  clientId = tag[1].toLowerCase();
  text = text.replace(tag[0], '').trim();
}
const skipIntake = /--quick\b/i.test(text);
text = text.replace(/--quick\b/gi, '').trim();

const ids = Object.keys(BRAINS);
if (!clientId || !BRAINS[clientId]) {
  const lower = text.toLowerCase();
  clientId =
    ids.find((id) => (BRAINS[id].slack_channel_ids || []).includes(e.channel)) ||
    ids.find((id) => (BRAINS[id].aliases || []).some((a) => lower.includes(a.toLowerCase()))) ||
    ($env.DEFAULT_CLIENT_ID && BRAINS[$env.DEFAULT_CLIENT_ID] ? $env.DEFAULT_CLIENT_ID : ids[0]);
}
const brain = BRAINS[clientId];
const guide = brain.brand_guidelines || {};
const learned = sd.learned[clientId] || [];

const day = new Date().toISOString().slice(0, 10);
const limit = (brain.limits && brain.limits.max_images_per_day) || Number($env.DAILY_IMAGE_LIMIT) || 40;
const used = (sd.usage[clientId] && sd.usage[clientId][day]) || 0;
const withinLimit = used + 1 <= limit;

const banned = guide.banned_elements || [];
const rejections = []
  .concat((brain.rejection_history || []).map((r) => `${r.rejected_element} -> rule: ${r.corrective_rule}`))
  .concat(learned.map((r) => `${r.client_feedback} -> rule: ${r.corrective_rule}`));
const golden = (brain.approved_past_work || []).map(
  (a) => `${a.campaign_name}: ${a.visual_style_description} | headline "${a.headline}"`
);
const maxChars = (guide.typography_rules && guide.typography_rules.max_text_characters) || 25;

const brainPrompt = `You are the Executive Creative Director of an elite agency working for the client "${brain.company_name}".

CLIENT BRAIN
Brand guidelines (JSON): ${JSON.stringify(guide)}
Context (JSON): ${JSON.stringify(brain.collection_context || brain.public_facts || {})}
Past approved work to emulate: ${golden.length ? golden.join(' | ') : 'none yet'}
Mistakes to NEVER repeat: ${rejections.length ? rejections.join(' | ') : 'none yet'}
Headlines printed on images: maximum ${maxChars} characters, Latin script. Never use banned elements.`;

const intakeSystem = `You extract a social media design brief from a client's Slack message.
Only use what the message clearly states. Never guess. Use null for anything not stated.
Return ONLY JSON: {"platform": <id or null>, "objective": <id or null>, "product_focus": <string or null>, "audience": <string or null>, "visual_style": <string or null>, "assets": <id or null>}
platform ids: ${OPTIONS.platforms.map((p) => `${p.id} (${p.label})`).join('; ')}
objective ids: ${OPTIONS.objectives.map((o) => `${o.id} (${o.label})`).join('; ')}
assets ids: will_attach (the message says real photos are attached or provided), none (the message says there are no photos)
product_focus: the specific product, collection or offer. audience: who it is for. visual_style: the look or mood asked for.`;

let jobId = null;
if (withinLimit) {
  jobId = 'job_' + now.toString(36) + Math.random().toString(36).slice(2, 6);
  sd.jobs[jobId] = {
    client_id: clientId,
    channel: e.channel,
    thread_ts: e.thread_ts || e.ts,
    request: text,
    status: 'intake',
    created: now,
    revision: 0,
    limit,
    qa_rules: banned.join('; '),
    qa_warnings: 0,
    brain_prompt: brainPrompt,
    requires_photos: !!brain.requires_product_photos,
    default_audience: brain.default_audience || '',
    brand_name: brain.company_name,
  };
}

return [{
  json: {
    job_id: jobId,
    client_id: clientId,
    brand_name: brain.company_name,
    channel: e.channel,
    thread_ts: e.thread_ts || e.ts,
    within_limit: withinLimit,
    limit,
    used,
    skip_intake: skipIntake,
    has_files: Array.isArray(e.files) && e.files.length > 0,
    intake_system_prompt: intakeSystem,
    intake_user_prompt: text || 'No details given.',
  },
}];
