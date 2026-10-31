// Final message after all batch posts were delivered.
const s = $('Build Delivery Message').last().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[s.job_id];
let warn = '';
if (job) {
  job.status = 'complete';
  if (job.qa_warnings) warn = ` ${job.qa_warnings} image(s) did not fully pass Vision QA, please review them.`;
}
return [{
  json: {
    slack_url: 'https://slack.com/api/chat.postMessage',
    slack_payload: {
      channel: s.channel,
      thread_ts: s.thread_ts,
      text: `:white_check_mark: Campaign complete. All images are saved in this thread.${warn}`,
    },
  },
}];
