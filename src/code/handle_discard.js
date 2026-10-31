// Discard button: marks the job discarded and replaces the card so the buttons disappear.
const r = $input.first().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[r.job_id];
if (job) job.status = 'discarded';
return [{
  json: {
    slack_url: 'https://slack.com/api/chat.update',
    slack_payload: {
      channel: r.channel,
      ts: r.message_ts,
      text: 'Draft discarded',
      blocks: [{
        type: 'section',
        text: { type: 'mrkdwn', text: `:x: Draft discarded by <@${r.user_id}>. No more images will be generated for this job.` },
      }],
    },
  },
}];
