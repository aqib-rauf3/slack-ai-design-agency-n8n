// Re-attaches the downloaded image to the item together with Slack's upload URL.
const state = $('Prepare Slack Upload').last().json;
const r = $input.first().json;
if (!r.ok) throw new Error('Slack files.getUploadURLExternal failed: ' + (r.error || JSON.stringify(r)));
return [{
  json: { ...state, upload_url: r.upload_url, file_id: r.file_id },
  binary: $('Download Image').last().binary,
}];
