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

const secret = $env.SLACK_SIGNING_SECRET;
const ts = header('x-slack-request-timestamp');
const sig = header('x-slack-signature');
const hmac = (text) => 'v0=' + crypto.createHmac('sha256', secret).update(`v0:${ts}:${text}`).digest('hex');
const same = (x) => {
  const a = Buffer.from(x);
  const b = Buffer.from(String(sig || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const parsedBody = item.json.body || {};
// n8n's Code sandbox has no URLSearchParams, so form encoding is handled by hand.
const formDecode = (x) => {
  try { return decodeURIComponent(String(x).replace(/\+/g, ' ')); } catch (e) { return null; }
};
const formGet = (text, key) => {
  for (const part of String(text).split('&')) {
    const i = part.indexOf('=');
    if (formDecode(i < 0 ? part : part.slice(0, i)) === key) return formDecode(i < 0 ? '' : part.slice(i + 1));
  }
  return null;
};
const formEncode = (x) =>
  encodeURIComponent(x).replace(/[!'()~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+');

// 1. Parse the body. n8n can hand over form posts (buttons, forms) in different shapes, so try each one.
let body = null;
let payloadText = null;
const tryJson = (v) => {
  if (v && typeof v === 'object') return v;
  if (typeof v !== 'string' || !v.trim()) return null;
  try {
    const o = JSON.parse(v);
    return o && typeof o === 'object' ? o : null;
  } catch (e) {
    return null;
  }
};
if (MODE === 'events') {
  body = tryJson(raw) || tryJson(parsedBody);
} else {
  const candidates = [];
  if (raw) {
    candidates.push(formGet(raw, 'payload'));
    const after = raw.replace(/^payload=/, '');
    candidates.push(after);
    try { candidates.push(decodeURIComponent(after.replace(/\+/g, ' '))); } catch (e) {}
  }
  candidates.push(parsedBody.payload);
  for (const c of candidates) {
    const o = tryJson(c);
    if (o && o.type) {
      body = o;
      payloadText = typeof c === 'string' ? c : JSON.stringify(c);
      break;
    }
  }
}

// 2. Check the signature against the raw body; if n8n did not keep it byte for byte, rebuild the form encoding.
let valid = false;
let reason = '';
if ($env.SLACK_SKIP_SIGNATURE_CHECK === 'true') {
  valid = true;
  reason = 'signature check skipped (dev mode)';
} else if (!secret) {
  reason = 'SLACK_SIGNING_SECRET is not set';
} else if (!ts || !sig) {
  reason = 'missing signature headers';
} else if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
  reason = 'timestamp too old';
} else {
  const variants = [raw];
  if (MODE !== 'events' && payloadText) {
    const enc = encodeURIComponent(payloadText);
    variants.push('payload=' + enc, 'payload=' + enc.replace(/%20/g, '+'), 'payload=' + formEncode(payloadText));
  }
  valid = variants.some((v) => v && same(hmac(v)));
  if (!valid) reason = 'signature mismatch';
}
if (!body) {
  valid = false;
  reason = 'body could not be parsed';
  body = {};
}
const debug = {
  raw_length: raw.length,
  raw_start: raw.slice(0, 10),
  body_keys: Object.keys(parsedBody).slice(0, 5),
  content_type: header('content-type') || '',
};

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
      debug,
    },
  }];
}
return [{ json: { valid, reason, payload: body, debug } }];
