// Reads the Ideogram result, counts usage, and prepares the Vision QA prompt.
const state = $('Render Input').last().json;
const res = $input.first().json;
const url = res && res.data && res.data[0] && res.data[0].url;
if (!url) throw new Error('Ideogram returned no image: ' + JSON.stringify(res).slice(0, 300));

const sd = $getWorkflowStaticData('global');
sd.usage = sd.usage || {};
const day = new Date().toISOString().slice(0, 10);
sd.usage[state.client_id] = sd.usage[state.client_id] || {};
sd.usage[state.client_id][day] = (sd.usage[state.client_id][day] || 0) + 1;
for (const d of Object.keys(sd.usage[state.client_id])) {
  if (d < new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10)) delete sd.usage[state.client_id][d];
}

const qa_system_prompt = `You are a strict Vision QA inspector for advertising images.
Expected headline text: "${state.headline}". Read the text on the image and compare it character by character.
Client banned elements: ${state.qa_rules || 'none'}.
Check: (1) the headline is spelled exactly, (2) text is sharp and legible, (3) no distorted hands, faces, anatomy, fabric or embroidery, (4) none of the banned elements appear, (5) the look fits a premium brand.
Return ONLY JSON: {"detected_text": "<all text you can read on the image>", "legibility_score": <0-100>, "is_blurry": <bool>, "has_distortion": <bool>, "violates_banned_elements": <bool>, "pass": <bool>, "critique": "<specific, fixable problems>"}`;

return [{ json: { ...state, image_url: url, qa_system_prompt } }];
