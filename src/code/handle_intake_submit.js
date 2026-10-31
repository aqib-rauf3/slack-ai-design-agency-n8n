// Form submitted: validate the answers, save the brief on the job, and let planning start.
const OPTIONS = __INTAKE_OPTIONS__;
const r = $input.first().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[r.job_id];

const blocked = (msg) => [{
  json: {
    blocked: true,
    slack_url: 'https://slack.com/api/chat.postMessage',
    slack_payload: { channel: (job && job.channel) || r.channel, thread_ts: job ? job.thread_ts : undefined, text: msg },
  },
}];

if (!job) return blocked(':warning: I could not find this request. Please mention the bot again to start a new campaign.');
if (job.status !== 'awaiting_intake') return blocked(`:information_source: This brief was already submitted (status: ${job.status}).`);

const b = r.brief || {};
const valid = (list, v) => list.some((o) => o.id === v);
if (!valid(OPTIONS.platforms, b.platform) || !valid(OPTIONS.objectives, b.objective) || !valid(OPTIONS.assets, b.assets) || !b.product_focus) {
  return blocked(':warning: Some answers were missing. Please press the button again and fill every required question.');
}

const day = new Date().toISOString().slice(0, 10);
const used = (sd.usage && sd.usage[job.client_id] && sd.usage[job.client_id][day]) || 0;
if (used + 1 > job.limit) return blocked(`:no_entry: Daily image limit reached (${used} of ${job.limit}). Try again tomorrow.`);

job.brief = {
  platform: b.platform,
  objective: b.objective,
  product_focus: String(b.product_focus).trim().slice(0, 300),
  audience: b.audience ? String(b.audience).trim().slice(0, 300) : null,
  visual_style: b.visual_style ? String(b.visual_style).trim().slice(0, 300) : null,
  assets: b.assets,
};
job.status = 'planning';
return [{ json: { blocked: false, job_id: r.job_id } }];
