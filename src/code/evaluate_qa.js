// Decides pass/fail from the REAL Vision QA result. Spelling is checked here in code, not trusted to the model.
const state = $('Collect Render Result').last().json;
let qa = {};
try {
  qa = JSON.parse($input.first().json.choices[0].message.content);
} catch (err) {
  qa = { parse_error: true, critique: 'QA response was not valid JSON' };
}

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9؀-ۿ]/g, '');
const want = norm(state.headline);
const got = norm(qa.detected_text);
const score = Number(qa.legibility_score) || 0;

const problems = [];
if (qa.parse_error) problems.push(qa.critique);
if (!want || !got.includes(want)) {
  problems.push(`Headline must read exactly "${state.headline}" but the image reads "${qa.detected_text || ''}"`);
}
if (score < state.qa_min_score) problems.push(`Legibility score ${score} is below ${state.qa_min_score}`);
if (qa.is_blurry) problems.push('Text or image is blurry');
if (qa.has_distortion) problems.push('Distorted hands, faces, fabric or embroidery');
if (qa.violates_banned_elements) problems.push('Contains a banned element');
if (qa.pass === false && qa.critique && problems.length === 0) problems.push(qa.critique);

const pass = problems.length === 0;
const canRetry = state.attempt <= state.max_retries;

return [{
  json: {
    ...state,
    qa: { pass, score, detected_text: qa.detected_text || '', problems, critique: qa.critique || '' },
    qa_pass: pass,
    proceed: pass || !canRetry,
  },
}];
