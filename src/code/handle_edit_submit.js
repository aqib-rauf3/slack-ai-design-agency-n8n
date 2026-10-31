// Modal submit: saves the feedback as a learned rule for this client and queues a revised Post 1.
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

if (!job || !job.plan) return blocked(':warning: I could not find this draft. Please ask for a new campaign.');
if (job.status !== 'awaiting_review') return blocked(`:information_source: This draft was already handled (status: ${job.status}).`);
if (!r.notes) return blocked(':information_source: No change notes were provided, so nothing was regenerated.');

const day = new Date().toISOString().slice(0, 10);
const used = (sd.usage && sd.usage[job.client_id] && sd.usage[job.client_id][day]) || 0;
if (used + 1 > job.limit) return blocked(`:no_entry: Daily image limit reached (${used} of ${job.limit}).`);

sd.learned = sd.learned || {};
sd.learned[job.client_id] = sd.learned[job.client_id] || [];
sd.learned[job.client_id].push({
  date: new Date().toISOString().slice(0, 10),
  rejected_element: `Draft revision request (${r.job_id})`,
  client_feedback: r.notes,
  corrective_rule: r.notes,
});
if (sd.learned[job.client_id].length > 20) sd.learned[job.client_id].shift();

job.revision = (job.revision || 0) + 1;
job.status = 'revising';
const p = job.plan.posts[0];

return [{
  json: {
    blocked: false,
    job_id: r.job_id,
    client_id: job.client_id,
    mode: 'draft',
    post_index: p.index,
    total: job.plan.posts.length,
    headline: p.headline_text,
    art_prompt: `${p.art_prompt} Client revision notes (must follow): ${r.notes}`,
    caption: p.caption,
    hashtags: p.hashtags,
    channel: job.channel,
    thread_ts: job.thread_ts,
    attempt: 1,
    max_retries: 2,
    qa_rules: job.qa_rules,
    qa_min_score: 80,
    revision_notes: r.notes,
    card_channel: job.card_channel,
    card_ts: job.card_ts,
  },
}];
