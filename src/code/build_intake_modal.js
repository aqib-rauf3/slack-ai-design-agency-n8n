// Opens the 6-question Slack form, pre-filled with everything already understood from the message.
const OPTIONS = __INTAKE_OPTIONS__;
const r = $input.first().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[r.job_id];
const title = { type: 'plain_text', text: 'Quick brief' };

if (!job || job.status !== 'awaiting_intake') {
  return [{
    json: {
      slack_url: 'https://slack.com/api/views.open',
      slack_payload: {
        trigger_id: r.trigger_id,
        view: {
          type: 'modal',
          title,
          close: { type: 'plain_text', text: 'Close' },
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'These questions were already answered, or the request is too old. Please mention the bot again to start a new campaign.' } }],
        },
      },
    },
  }];
}

const b = job.brief_draft || {};
const opts = (list) => list.map((o) => ({ text: { type: 'plain_text', text: o.label.slice(0, 75) }, value: o.id }));
const select = (list, current, placeholder) => {
  const el = { type: 'static_select', action_id: 'value', placeholder: { type: 'plain_text', text: placeholder }, options: opts(list) };
  const found = list.find((o) => o.id === current);
  if (found) el.initial_option = { text: { type: 'plain_text', text: found.label.slice(0, 75) }, value: found.id };
  return el;
};
const text = (current, placeholder, multiline) => {
  const el = { type: 'plain_text_input', action_id: 'value', multiline: !!multiline, placeholder: { type: 'plain_text', text: placeholder } };
  if (current) el.initial_value = current;
  return el;
};
const input = (id, label, element, optional) => ({
  type: 'input',
  block_id: id,
  optional: !!optional,
  label: { type: 'plain_text', text: label },
  element,
});

const view = {
  type: 'modal',
  callback_id: 'intake_modal',
  private_metadata: r.job_id,
  title,
  submit: { type: 'plain_text', text: 'Start design' },
  close: { type: 'plain_text', text: 'Cancel' },
  blocks: [
    input('platform_block', '1. Where will it be posted? (sets the size)', select(OPTIONS.platforms, b.platform, 'Choose a platform')),
    input('objective_block', '2. What is the goal?', select(OPTIONS.objectives, b.objective, 'Choose a goal')),
    input('product_block', '3. Which product or collection?', text(b.product_focus, 'e.g. Mbroidered winter collection, 3-piece suits', false)),
    input('audience_block', '4. Who is it for? (optional)', text(b.audience, 'e.g. brides and wedding guests, women 25-40', false), true),
    input('style_block', '5. Look and mood (optional)', text(b.visual_style, 'e.g. soft studio light, deep jewel tones, editorial', false), true),
    input('assets_block', '6. Do you have real product photos?', select(OPTIONS.assets, b.assets, 'Choose one')),
  ],
};

return [{
  json: { slack_url: 'https://slack.com/api/views.open', slack_payload: { trigger_id: r.trigger_id, view } },
}];
