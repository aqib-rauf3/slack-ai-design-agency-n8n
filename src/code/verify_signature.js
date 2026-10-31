// Verifies the Slack request signature and parses the body.
// The build script replaces __MODE__ with 'events' or 'interactivity'.
const MODE = '__MODE__';
const crypto = require('crypto');
const item = $input.first();
const headers = item.json.headers || {};
const header = (n) => headers[n] || headers[n.toLowerCase()];

let raw = '';
try {
  const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
  raw = buf.toString('utf8');
} catch (e) {
  raw = '';
}

let valid = false;
let reason = '';
const secret = $env.SLACK_SIGNING_SECRET;

if ($env.SLACK_SKIP_SIGNATURE_CHECK === 'true') {
  valid = true;
  reason = 'signature check skipped (dev mode)';
} else if (!secret) {
  reason = 'SLACK_SIGNING_SECRET is not set';
} else {
  const ts = header('x-slack-request-timestamp');
  const sig = header('x-slack-signature');
  if (!ts || !sig) {
    reason = 'missing signature headers';
  } else if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    reason = 'timestamp too old';
  } else {
    const expected = 'v0=' + crypto.createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(sig));
    valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!valid) reason = 'signature mismatch';
  }
}

let body = {};
try {
  if (raw) {
    body = MODE === 'events' ? JSON.parse(raw) : JSON.parse(new URLSearchParams(raw).get('payload') || '{}');
  } else {
    const parsed = item.json.body || {};
    body = MODE === 'events' ? parsed : JSON.parse(parsed.payload || '{}');
  }
} catch (e) {
  valid = false;
  reason = 'body could not be parsed';
}

if (MODE === 'events') {
  const event = body.event || {};
  const isRetry = header('x-slack-retry-num') !== undefined;
  return [{
    json: {
      valid,
      reason,
      body,
      is_challenge: body.type === 'url_verification',
      challenge: body.challenge || '',
      is_mention: body.type === 'event_callback' && event.type === 'app_mention' && !event.bot_id && !isRetry,
    },
  }];
}
return [{ json: { valid, reason, payload: body } }];
