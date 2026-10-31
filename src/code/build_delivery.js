// Builds the Slack message for a finished image: a review card (draft) or a caption message (batch).
const s = $('Attach Image & Upload URL').last().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[s.job_id];

const qaLine = s.qa.pass
  ? `:large_green_circle: *Vision QA passed* | legibility ${s.qa.score}/100 | text read: "${s.qa.detected_text}"`
  : `:large_orange_circle: *Vision QA did not fully pass after ${s.attempt} attempt(s):* ${s.qa.problems.join('; ')}`;
if (!s.qa.pass && job) job.qa_warnings = (job.qa_warnings || 0) + 1;

const captionText = `${s.caption}\n\n${s.hashtags}`.trim();
let payload;

if (s.mode === 'draft') {
  if (job) {
    job.status = 'awaiting_review';
    job.draft = { headline: s.headline, post_index: s.post_index, attempt: s.attempt, qa_pass: s.qa.pass };
  }
  const title = `Draft: Post ${s.post_index} of ${s.total}` + (job && job.revision ? ` (revision ${job.revision})` : '');
  payload = {
    channel: s.channel,
    thread_ts: s.thread_ts,
    text: `${title} is ready for review`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: title.slice(0, 150) } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: qaLine.slice(0, 2900) }] },
      { type: 'section', text: { type: 'mrkdwn', text: `*Headline:* ${s.headline}\n*Proposed caption:*\n${captionText}`.slice(0, 2900) } },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: `Approve and generate ${Math.max(s.total - 1, 0)} more posts` }, style: 'primary', action_id: 'btn_approve_batch', value: s.job_id },
          { type: 'button', text: { type: 'plain_text', text: 'Request changes' }, action_id: 'btn_request_edit', value: s.job_id },
          { type: 'button', text: { type: 'plain_text', text: 'Discard' }, style: 'danger', action_id: 'btn_discard', value: s.job_id },
        ],
      },
    ],
  };
} else {
  payload = {
    channel: s.channel,
    thread_ts: s.thread_ts,
    text: `*Post ${s.post_index} of ${s.total}: ${s.headline}*\n${captionText}\n${qaLine}`.slice(0, 3900),
  };
}

return [{
  json: {
    mode: s.mode,
    job_id: s.job_id,
    channel: s.channel,
    thread_ts: s.thread_ts,
    slack_url: 'https://slack.com/api/chat.postMessage',
    slack_payload: payload,
  },
}];
