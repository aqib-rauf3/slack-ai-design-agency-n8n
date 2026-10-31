// TEST MODE: stands in for GPT-4o Vision QA. Passes by default.
// Set TEST_MODE_QA_FAIL_FIRST=true in .env to fail the first attempt once, so you can watch the retry loop.
const s = $input.first().json;
const failOnce = $env.TEST_MODE_QA_FAIL_FIRST === 'true' && s.attempt === 1;
const qa = failOnce
  ? { detected_text: String(s.headline || '').replace(/E/, '3'), legibility_score: 70, is_blurry: false, has_distortion: false, violates_banned_elements: false, pass: false, critique: 'TEST MODE: simulated spelling error' }
  : { detected_text: s.headline, legibility_score: 95, is_blurry: false, has_distortion: false, violates_banned_elements: false, pass: true, critique: 'TEST MODE: QA simulated' };
return [{ json: { test_mode: true, choices: [{ message: { content: JSON.stringify(qa) } }] } }];
