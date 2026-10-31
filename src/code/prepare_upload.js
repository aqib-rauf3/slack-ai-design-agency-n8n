// Computes the file size and name needed by Slack's external upload API.
const state = $('Evaluate QA').last().json;
const input = $input.first();
const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
const mime = (input.binary && input.binary.data && input.binary.data.mimeType) || 'image/png';
const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
const filename = `${state.client_id}-${state.job_id}-post${state.post_index}.${ext}`;
return [{ json: { ...state, filename, file_length: buf.length } }];
