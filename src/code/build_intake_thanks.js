// Confirms the brief back to the client so misunderstandings are caught before any image is made.
const OPTIONS = __INTAKE_OPTIONS__;
const i = $input.first().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[i.job_id];
const b = job.brief;
const label = (list, id) => (list.find((o) => o.id === id) || {}).label || id;
return [{
  json: {
    slack_url: 'https://slack.com/api/chat.postMessage',
    slack_payload: {
      channel: job.channel,
      thread_ts: job.thread_ts,
      text: `:memo: Thanks. Planning now: *${label(OPTIONS.platforms, b.platform)}*, goal: ${label(OPTIONS.objectives, b.objective)}, product: ${b.product_focus}. I will send one draft for your approval first.`,
    },
  },
}];
