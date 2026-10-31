// Validates the extracted brief in code (does not trust the model) and decides:
// complete -> go straight to planning, or incomplete -> ask the client.
const OPTIONS = __INTAKE_OPTIONS__;
const ctx = $('Load Brain & Build Prompt').last().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[ctx.job_id];
if (!job) throw new Error('Job not found: ' + ctx.job_id);

let x = {};
try {
  x = JSON.parse($input.first().json.choices[0].message.content);
} catch (err) {
  x = {};
}
const pick = (list, v) => (list.some((o) => o.id === v) ? v : null);
const clean = (s) =>
  typeof s === 'string' && s.trim() && !/^(null|none|n\/a|unknown|not stated)$/i.test(s.trim()) ? s.trim().slice(0, 300) : null;

const brief = {
  platform: pick(OPTIONS.platforms, x.platform),
  objective: pick(OPTIONS.objectives, x.objective),
  product_focus: clean(x.product_focus),
  audience: clean(x.audience),
  visual_style: clean(x.visual_style),
  assets: pick(OPTIONS.assets, x.assets),
};
if (ctx.has_files) brief.assets = 'will_attach';

if (ctx.skip_intake) {
  brief.platform = brief.platform || 'ig_feed_4x5';
  brief.objective = brief.objective || 'brand_awareness';
  brief.product_focus = brief.product_focus || job.request || 'the brand';
  brief.assets = brief.assets || 'none';
}

const missing = [];
if (!brief.platform) missing.push('platform');
if (!brief.objective) missing.push('objective');
if (!brief.product_focus) missing.push('product_focus');
if (job.requires_photos && !brief.assets) missing.push('assets');

if (missing.length === 0) {
  job.brief = brief;
  job.status = 'planning';
  return [{ json: { complete: true, job_id: ctx.job_id } }];
}

job.brief_draft = brief;
job.status = 'awaiting_intake';
return [{
  json: { complete: false, job_id: ctx.job_id, channel: job.channel, thread_ts: job.thread_ts, brief, missing },
}];
