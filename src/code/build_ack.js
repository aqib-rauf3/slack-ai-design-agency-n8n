// Immediate acknowledgement in the Slack thread.
const e = $input.first().json.body.event;
return [{
  json: {
    slack_url: 'https://slack.com/api/chat.postMessage',
    slack_payload: {
      channel: e.channel,
      thread_ts: e.thread_ts || e.ts,
      text: ':brain: Got it. Checking your brief against the client brain. If something is missing I will ask a few quick questions first, then I will make a single draft (Post 1) and wait for your approval before generating the rest.',
    },
  },
}];
