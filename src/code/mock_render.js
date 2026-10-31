// TEST MODE: stands in for Ideogram. Returns a free placeholder image (placehold.co) with the headline printed on it,
// in the same size as the brief, so download, Slack upload and the review card all run for real.
const s = $input.first().json;
const sizes = { ASPECT_4_5: '1080x1350', ASPECT_1_1: '1080x1080', ASPECT_9_16: '1080x1920', ASPECT_16_9: '1920x1080' };
const size = sizes[s.aspect_ratio] || sizes.ASPECT_4_5;
const url = `https://placehold.co/${size}/6B1E3A/F3E6D0/png?font=playfair-display&text=${encodeURIComponent(s.headline || 'TEST POST')}`;
return [{ json: { test_mode: true, data: [{ url, prompt: s.art_prompt }] } }];
