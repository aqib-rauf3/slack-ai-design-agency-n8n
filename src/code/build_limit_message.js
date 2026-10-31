// Tells the team the daily image limit was reached.
const c = $input.first().json;
return [{
  json: {
    slack_url: 'https://slack.com/api/chat.postMessage',
    slack_payload: {
      channel: c.channel,
      thread_ts: c.thread_ts,
      text: `:no_entry: Daily image limit reached for ${c.brand_name} (${c.used} of ${c.limit} images used today). Try again tomorrow or raise "limits.max_images_per_day" in the client brain.`,
    },
  },
}];
