// One Slack notice per approve or revision (even when several items are queued).
const s = $input.first().json;
if (s.mode === 'batch') {
  return [{
    json: {
      slack_url: 'https://slack.com/api/chat.update',
      slack_payload: {
        channel: s.card_channel,
        ts: s.card_ts,
        text: 'Approved, generating the rest of the campaign',
        blocks: [{
          type: 'section',
          text: { type: 'mrkdwn', text: `:white_check_mark: Approved by <@${s.approved_by}>. Generating posts 2 to ${s.total} now. Each image is checked before it is posted.` },
        }],
      },
    },
  }];
}
return [{
  json: {
    slack_url: 'https://slack.com/api/chat.postMessage',
    slack_payload: {
      channel: s.channel,
      thread_ts: s.thread_ts,
      text: `:arrows_counterclockwise: Regenerating the draft with your notes: _${s.revision_notes}_`,
    },
  },
}];
