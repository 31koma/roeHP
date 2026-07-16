const crypto = require('node:crypto');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_BUCKET = 'news-images';
const SUPPORTED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

module.exports = async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST, OPTIONS');
    response.status(405).json({ success: false, reason: 'Method not allowed.' });
    return;
  }

  try {
    requireApiKey(request);
    const postId = normalizePostId(request.headers['x-post-id']);
    const contentType = normalizeContentType(request.headers['content-type']);
    const extension = SUPPORTED_TYPES[contentType];
    if (!extension) {
      throwHttpError(400, 'JPEG・PNG・WebP・GIFの画像を選択してください。');
    }

    const image = await readImageBody(request);
    const fileName = `${postId}.${extension}`;
    const publicUrl = await uploadImage(fileName, contentType, image);
    response.status(201).json({ success: true, url: publicUrl, fileName });
  } catch (error) {
    response.status(error.statusCode || 500).json({
      success: false,
      reason: error.statusCode ? error.message : '画像を保存できませんでした。'
    });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throwHttpError(500, '画像保存先が設定されていません。');
  }
  return { url: url.replace(/\/+$/, ''), serviceRoleKey };
}

function storageHeaders(contentType) {
  const { serviceRoleKey } = getSupabaseConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...(contentType ? { 'Content-Type': contentType } : {})
  };
}

async function uploadImage(fileName, contentType, image) {
  const { url } = getSupabaseConfig();
  let result = await putObject(url, fileName, contentType, image);
  if (!result.response.ok && isMissingBucket(result.details)) {
    await ensurePublicBucket(url);
    result = await putObject(url, fileName, contentType, image);
  }

  if (!result.response.ok) {
    throwHttpError(result.response.status || 502, result.details?.message || result.details?.error || '画像を保存できませんでした。');
  }

  return `${url}/storage/v1/object/public/${IMAGE_BUCKET}/${encodeURIComponent(fileName)}`;
}

async function putObject(url, fileName, contentType, image) {
  const response = await fetch(`${url}/storage/v1/object/${IMAGE_BUCKET}/${encodeURIComponent(fileName)}`, {
    method: 'POST',
    headers: {
      ...storageHeaders(contentType),
      'x-upsert': 'true'
    },
    body: image
  });
  const details = await response.json().catch(() => null);
  return { response, details };
}

async function ensurePublicBucket(url) {
  const response = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: storageHeaders('application/json'),
    body: JSON.stringify({
      id: IMAGE_BUCKET,
      name: IMAGE_BUCKET,
      public: true,
      file_size_limit: MAX_IMAGE_BYTES,
      allowed_mime_types: Object.keys(SUPPORTED_TYPES)
    })
  });

  if (!response.ok && response.status !== 409) {
    const details = await response.json().catch(() => null);
    throwHttpError(response.status || 502, details?.message || details?.error || '画像保存領域を準備できませんでした。');
  }
}

function isMissingBucket(details) {
  const message = String(details?.message || details?.error || '').toLowerCase();
  return message.includes('bucket') && (message.includes('not found') || message.includes('does not exist'));
}

async function readImageBody(request) {
  const declaredLength = Number.parseInt(request.headers['content-length'] || '0', 10);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throwHttpError(413, '画像は5MB以下にしてください。');
  }

  if (Buffer.isBuffer(request.body)) {
    if (!request.body.length || request.body.length > MAX_IMAGE_BYTES) {
      throwHttpError(400, '画像は5MB以下にしてください。');
    }
    return request.body;
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_IMAGE_BYTES) {
      throwHttpError(413, '画像は5MB以下にしてください。');
    }
    chunks.push(buffer);
  }

  if (!total) throwHttpError(400, '画像を選択してください。');
  return Buffer.concat(chunks);
}

function normalizePostId(value) {
  const postId = Array.isArray(value) ? value[0] : String(value || '');
  if (!/^roes-post-[a-zA-Z0-9-]{8,}$/.test(postId)) {
    throwHttpError(400, '投稿IDが正しくありません。');
  }
  return postId;
}

function normalizeContentType(value) {
  const contentType = Array.isArray(value) ? value[0] : String(value || '');
  return contentType.split(';')[0].trim().toLowerCase();
}

function requireApiKey(request) {
  const expectedKey = process.env.NEWS_API_KEY;
  const providedKey = request.headers['x-api-key'];
  if (!expectedKey || typeof providedKey !== 'string') throwHttpError(401, 'Unauthorized.');
  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(expectedKey);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throwHttpError(401, 'Unauthorized.');
  }
}

function throwHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-post-id');
}
