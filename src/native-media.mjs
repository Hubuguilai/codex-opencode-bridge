import {invalid, unsupported} from './errors.mjs';

// Preserve images as OpenCode media parts, never as base64 text in a prompt.
// Only inline data is accepted: the bridge does not fetch remote/local URLs.
export function nativeContent(content, {images = false, role = 'user', detailPolicy = 'strict', warnings = []} = {}) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) throw invalid('Expected message content.');
  const parts = content.map(part => {
    if (['input_text', 'output_text', 'text'].includes(part?.type) && typeof part.text === 'string') {
      return {type: 'text', text: part.text};
    }
    if (!images || role !== 'user' || !['input_image', 'image_url'].includes(part?.type)) {
      throw unsupported('This route/role does not support this content type.');
    }
    const url = part.type === 'input_image' ? part.image_url : part.image_url?.url;
    const detail = part.detail ?? part.image_url?.detail;
    if (detail != null && detail !== 'auto') {
      if (detailPolicy !== 'auto' || !['low', 'high', 'original'].includes(detail)) throw unsupported('Only automatic image detail is supported.');
      if (!warnings.includes('image_detail_auto')) warnings.push('image_detail_auto');
    }
    if (typeof url !== 'string' || !url.startsWith('data:')) throw unsupported('Images require inline base64 data URLs; remote URLs and file IDs are unsupported.');
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
    if (!match || match[2].length % 4 || Buffer.from(match[2], 'base64').toString('base64') !== match[2]) {
      throw invalid('Image must contain canonical base64 with a supported image MIME type.');
    }
    return {type: 'media', mediaType: match[1], data: match[2]};
  });
  return parts.some(part => part.type === 'media') ? parts : parts.map(part => part.text).join('\n');
}

export function promptHistory(history) {
  return history.map(item => Array.isArray(item.content) ? {...item, content: item.content.map(part =>
    part.type === 'media' ? {type: 'text', text: '[Image supplied in native message content]'} : part)} : item);
}
