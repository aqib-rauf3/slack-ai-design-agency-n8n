// Approve button: validates the job and queues posts 2..N for the pipeline.
const r = $input.first().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[r.job_id];

const blocked = (msg) => [{
  json: {
    blocked: true,
    slack_url: 'https://slack.com/api/chat.postMessage',
    slack_payload: {
      channel: (job && job.channel) || r.channel,
      thread_ts: job ? job.thread_ts : undefined,
      text: msg,
    },
  },
}];

if (!job || !job.plan) return blocked(':warning: I could not find this draft. It may be older than 14 days or the workflow was restarted. Please ask for a new campaign.');
if (job.status !== 'awaiting_review') return blocked(`:information_source: This draft was already handled (status: ${job.status}).`);

const day = new Date().toISOString().slice(0, 10);
const used = (sd.usage && sd.usage[job.client_id] && sd.usage[job.client_id][day]) || 0;
const needed = job.plan.posts.length - 1;
if (used + needed > job.limit) {
  return blocked(`:no_entry: Not enough daily image budget left (${used} of ${job.limit} used, ${needed} needed). Try again tomorrow or raise the limit in the client brain.`);
}

job.status = 'generating';
job.card_channel = r.channel || job.card_channel;
job.card_ts = r.message_ts || job.card_ts;

return job.plan.posts.slice(1).map((p) => ({
  json: {
    blocked: false,
    job_id: r.job_id,
    client_id: job.client_id,
    mode: 'batch',
    post_index: p.index,
    total: job.plan.posts.length,
    headline: p.headline_text,
    art_prompt: p.art_prompt,
    caption: p.caption,
    hashtags: p.hashtags,
    channel: job.channel,
    thread_ts: job.thread_ts,
    attempt: 1,
    max_retries: 2,
    qa_rules: job.qa_rules,
    qa_min_score: 80,
    card_channel: job.card_channel,
    card_ts: job.card_ts,
    approved_by: r.user_id,
  },
}));
