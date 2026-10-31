// TEST MODE: stands in for the GPT-4o Creative Director. Returns a fixed 10-post plan in the same JSON shape.
const OPTIONS = __INTAKE_OPTIONS__;
const i = $input.first().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[i.job_id];
if (!job || !job.brief) throw new Error('No brief saved for job ' + i.job_id);

const b = job.brief;
const brand = job.brand_name || 'The Brand';
const goal = (OPTIONS.objectives.find((o) => o.id === b.objective) || OPTIONS.objectives[0]).label;
const tag = '#' + brand.replace(/[^A-Za-z0-9]/g, '');
const headlines = [
  'THE NEW EDIT', 'CRAFTED BY HAND', 'MADE FOR MOMENTS', 'EVERY THREAD MATTERS', 'OWN THE SEASON',
  'TIMELESS GRACE', 'DETAILS DEFINE YOU', 'DRESSED IN LIGHT', 'YOUR STORY WOVEN', 'SHOP THE EDIT',
];
const posts = headlines.map((h, n) => ({
  headline_text: h,
  art_direction_prompt: `TEST MODE placeholder for post ${n + 1}. Premium fashion layout for ${brand}, focus: ${b.product_focus}. Text on the image reads exactly: "${h}".`,
  caption: `[TEST MODE] ${brand}: ${b.product_focus}. ${goal}, post ${n + 1} of 10. The real AI caption appears here once OPENAI_API_KEY is set.`,
  hashtags: `${tag} #TestMode`,
}));
const plan = { campaign_theme: `TEST MODE: ${b.product_focus}`, posts };
return [{ json: { test_mode: true, choices: [{ message: { content: JSON.stringify(plan) } }] } }];
