// Single entry point for rendering (first attempt and QA retries both come through here).
// The image size comes from the confirmed brief saved on the job.
const s = $input.first().json;
const sd = $getWorkflowStaticData('global');
const job = sd.jobs && sd.jobs[s.job_id];
return [{
  json: {
    ...s,
    base_art_prompt: s.base_art_prompt || s.art_prompt,
    aspect_ratio: (job && job.aspect_ratio) || 'ASPECT_4_5',
  },
}];
