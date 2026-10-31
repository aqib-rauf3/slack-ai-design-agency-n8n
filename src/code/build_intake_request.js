// Posts the "I need a few details" message: what was understood, what is missing, and a button to open the form.
const OPTIONS = __INTAKE_OPTIONS__;
const i = $input.first().json;
const b = i.brief;
const label = (list, id) => (list.find((o) => o.id === id) || {}).label;

const rows = [
  ['Where will it be posted (size)', label(OPTIONS.platforms, b.platform)],
  ['Goal of the campaign', label(OPTIONS.objectives, b.objective)],
  ['Product or collection', b.product_focus],
  ['Target audience', b.audience],
  ['Look and mood', b.visual_style],
  ['Real product photos', label(OPTIONS.assets, b.assets)],
];
const lines = rows.map(([name, value]) => (value ? `:white_check_mark: *${name}:* ${value}` : `:grey_question: *${name}:* not stated`));

return [{
  json: {
    slack_url: 'https://slack.com/api/chat.postMessage',
    slack_payload: {
      channel: i.channel,
      thread_ts: i.thread_ts,
      text: 'I need a few details before I design. Please answer the quick questions.',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Before I design, I need a few details.* Answering them now means the first draft has the right size, goal and style, so you do not need to ask for changes later.',
          },
        },
        { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
        {
          type: 'actions',
          elements: [{
            type: 'button',
            style: 'primary',
            text: { type: 'plain_text', text: 'Answer 6 quick questions' },
            action_id: 'btn_intake_open',
            value: i.job_id,
          }],
        },
      ],
    },
  },
}];
