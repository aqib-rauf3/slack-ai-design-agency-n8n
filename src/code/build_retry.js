// QA failed and retries remain: add the QA feedback to the prompt and render again.
const s = $input.first().json;
const fix = s.qa.problems.join('; ');
return [{
  json: {
    job_id: s.job_id,
    client_id: s.client_id,
    mode: s.mode,
    post_index: s.post_index,
    total: s.total,
    headline: s.headline,
    caption: s.caption,
    hashtags: s.hashtags,
    channel: s.channel,
    thread_ts: s.thread_ts,
    max_retries: s.max_retries,
    qa_rules: s.qa_rules,
    qa_min_score: s.qa_min_score,
    card_channel: s.card_channel,
    card_ts: s.card_ts,
    approved_by: s.approved_by,
    revision_notes: s.revision_notes,
    base_art_prompt: s.base_art_prompt,
    attempt: s.attempt + 1,
    art_prompt: `${s.base_art_prompt} IMPORTANT corrections from the previous attempt: ${fix}. The text must be spelled exactly "${s.headline}".`,
  },
}];
