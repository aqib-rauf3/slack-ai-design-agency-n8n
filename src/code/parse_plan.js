// Parses the Creative Director's 10-post plan, saves it on the job, and emits Post 1 as the draft.
const ctx = $('Build CD Prompt').last().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[ctx.job_id];
if (!job) throw new Error('Job not found: ' + ctx.job_id);

let plan;
try {
  plan = JSON.parse($input.first().json.choices[0].message.content);
} catch (err) {
  throw new Error('Creative Director returned invalid JSON: ' + err.message);
}
const posts = (Array.isArray(plan.posts) ? plan.posts : []).filter(
  (p) => p && p.headline_text && p.art_direction_prompt
);
if (!posts.length) throw new Error('Creative Director returned no usable posts');

const clean = posts.slice(0, 10).map((p, i) => {
  const headline = String(p.headline_text).trim();
  let art = String(p.art_direction_prompt).trim();
  if (!art.includes(headline)) art += ` Text on the image reads exactly: "${headline}".`;
  return {
    index: i + 1,
    headline_text: headline,
    art_prompt: art,
    caption: String(p.caption || '').trim(),
    hashtags: String(p.hashtags || '').trim(),
  };
});
job.plan = { theme: plan.campaign_theme || '', posts: clean };
job.status = 'drafting';

const p = clean[0];
return [{
  json: {
    job_id: ctx.job_id,
    client_id: job.client_id,
    mode: 'draft',
    post_index: p.index,
    total: clean.length,
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
  },
}];
