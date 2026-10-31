// Builds the Creative Director prompt from the client brain plus the confirmed brief.
const OPTIONS = __INTAKE_OPTIONS__;
const TOTAL_POSTS = 10;
const i = $input.first().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[i.job_id];
if (!job || !job.brief) throw new Error('No brief saved for job ' + i.job_id);

const b = job.brief;
const find = (list, id) => list.find((o) => o.id === id) || list[0];
const platform = find(OPTIONS.platforms, b.platform);
const objective = find(OPTIONS.objectives, b.objective);
job.aspect_ratio = platform.aspect;
job.platform_label = platform.label;

let photoRule = '';
if (job.requires_photos) {
  photoRule =
    b.assets === 'will_attach'
      ? 'PRODUCT INTEGRITY: the client supplies real product photos. NEVER draw, redraw or change the garments or products. Design only the background, lighting, atmosphere and typography around a clean area where the real product will be placed.'
      : 'PRODUCT INTEGRITY: no real photos were supplied. Do not depict specific garments or products in detail. Prefer fabric textures, embroidery close-ups, environments, abstract settings and typography.';
}

const system_prompt = `${job.brain_prompt}

CONFIRMED BRIEF (answered by the client)
- Platform and size: ${platform.label}
- Campaign goal: ${objective.label}
- Product or collection focus: ${b.product_focus}
- Target audience: ${b.audience || job.default_audience || 'the brand\'s usual audience'}
- Visual style: ${b.visual_style || 'follow the brand guidelines'}
${photoRule}

TASK
Plan a ${TOTAL_POSTS}-post campaign for this brief. Each post needs a short headline printed on the image, a full image prompt, a caption written for the chosen platform and goal, and hashtags. Follow the client's caption structure and tone.
Every image prompt must be a complete prompt for a ${platform.ratio} image and must contain the exact headline text in quotes.

Return ONLY valid JSON with exactly this shape (no commentary):
{"campaign_theme": "<short theme>", "posts": [{"headline_text": "<text on image>", "art_direction_prompt": "<full image prompt>", "caption": "<caption>", "hashtags": "<hashtags>"}]}
The "posts" array must contain exactly ${TOTAL_POSTS} items, ordered as a narrative arc, with Post 1 being the strongest hero post.`;

return [{
  json: {
    job_id: i.job_id,
    client_id: job.client_id,
    system_prompt,
    user_prompt: job.request || `Create a campaign for ${b.product_focus}.`,
  },
}];
