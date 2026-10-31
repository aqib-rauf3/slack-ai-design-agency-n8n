// TEST MODE (TEST_MODE=true in .env): stands in for the OpenAI intake call. Same response shape, no cost.
// Very simple keyword matching. A vague request ("I need 10 posts") returns nulls so the intake form still opens.
const t = String($input.first().json.intake_user_prompt || '').toLowerCase();
const has = (...words) => words.some((w) => t.includes(w));

const platform =
  has('story', 'reel', '9:16') ? 'story_9x16'
  : has('square', '1:1') ? 'square_1x1'
  : has('linkedin', 'landscape', '16:9') ? 'landscape_16x9'
  : has('feed', '4:5', 'instagram') ? 'ig_feed_4x5'
  : null;
const objective =
  has('launch', 'new collection') ? 'product_launch'
  : has('sale', 'discount', 'offer') ? 'sale_promo'
  : has('eid', 'wedding', 'festival') ? 'festival_event'
  : has('awareness') ? 'brand_awareness'
  : has('engagement', 'community') ? 'engagement'
  : null;
const focus = t.match(/\bfor (?:the |our |my )?([a-z0-9 '&-]{3,60}?)(?:[.,!]|$)/);
const assets = has('no photo', 'without photo') ? 'none' : has('attached', 'will attach', 'photos provided') ? 'will_attach' : null;

const brief = { platform, objective, product_focus: focus ? focus[1].trim() : null, audience: null, visual_style: null, assets };
return [{ json: { test_mode: true, choices: [{ message: { content: JSON.stringify(brief) } }] } }];
