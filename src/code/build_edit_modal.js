// Request Changes button: opens a Slack modal asking what should change.
const r = $input.first().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[r.job_id];
const title = { type: 'plain_text', text: 'Request changes' };

let view;
if (!job || job.status !== 'awaiting_review') {
  view = {
    type: 'modal',
    title,
    close: { type: 'plain_text', text: 'Close' },
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'This draft is no longer waiting for review.' } }],
  };
} else {
  job.card_channel = r.channel;
  job.card_ts = r.message_ts;
  view = {
    type: 'modal',
    callback_id: 'edit_modal',
    private_metadata: r.job_id,
    title,
    submit: { type: 'plain_text', text: 'Regenerate' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [{
      type: 'input',
      block_id: 'notes_block',
      label: { type: 'plain_text', text: 'What should change?' },
      element: {
        type: 'plain_text_input',
        action_id: 'notes_input',
        multiline: true,
        placeholder: { type: 'plain_text', text: 'e.g. softer lighting, show more embroidery detail, move the text higher' },
      },
    }],
  };
}

return [{
  json: {
    slack_url: 'https://slack.com/api/views.open',
    slack_payload: { trigger_id: r.trigger_id, view },
  },
}];
