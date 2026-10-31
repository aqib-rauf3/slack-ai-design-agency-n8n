// Turns a Slack interactivity payload (button click or modal submit) into a simple route.
const p = $input.first().json.payload || {};
let route = 'ignore';
let job_id = null;
let notes = '';
let brief = null;

if (p.type === 'block_actions') {
  const a = (p.actions || [])[0] || {};
  job_id = a.value || null;
  route = {
    btn_approve_batch: 'approve',
    btn_request_edit: 'edit_open',
    btn_discard: 'discard',
    btn_intake_open: 'intake_open',
  }[a.action_id] || 'ignore';
} else if (p.type === 'view_submission' && p.view && p.view.callback_id === 'edit_modal') {
  route = 'edit_submit';
  job_id = p.view.private_metadata || null;
  const v = (p.view.state && p.view.state.values) || {};
  notes = (v.notes_block && v.notes_block.notes_input && v.notes_block.notes_input.value) || '';
} else if (p.type === 'view_submission' && p.view && p.view.callback_id === 'intake_modal') {
  route = 'intake_submit';
  job_id = p.view.private_metadata || null;
  const v = (p.view.state && p.view.state.values) || {};
  const val = (block) => {
    const el = v[block] && v[block].value;
    if (!el) return '';
    return el.selected_option ? el.selected_option.value : el.value || '';
  };
  brief = {
    platform: val('platform_block'),
    objective: val('objective_block'),
    product_focus: val('product_block').trim(),
    audience: val('audience_block').trim(),
    visual_style: val('style_block').trim(),
    assets: val('assets_block'),
  };
}

return [{
  json: {
    route,
    job_id,
    notes: notes.trim(),
    brief,
    trigger_id: p.trigger_id || null,
    user_id: (p.user && p.user.id) || null,
    channel: (p.channel && p.channel.id) || null,
    message_ts: (p.container && p.container.message_ts) || null,
  },
}];
