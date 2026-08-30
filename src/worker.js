const MAX_FIELD_LENGTH = 4000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-post-id'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      if (url.pathname === '/api/news') {
        return await handleNewsList(request, env, url);
      }

      if (url.pathname === '/api/news/create') {
        return await handleNewsCreate(request, env);
      }

      if (url.pathname === '/api/news/upload') {
        return await handleNewsUpload(request, env);
      }

      if (url.pathname.startsWith('/media/')) {
        return await handleMedia(request, env, url);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      if (status >= 500) {
        console.error('[roes-kitchen]', error?.name || 'Error', error?.message || error);
      }
      const response = jsonResponse(
        {
          success: false,
          reason: status < 500 ? error.message : 'Internal server error.',
          details: error?.details
        },
        status
      );
      for (const [name, value] of Object.entries(error?.headers || {})) {
        response.headers.set(name, value);
      }
      return response;
    }
  }
};

async function handleNewsList(request, env, url) {
  requireMethod(request, ['GET']);
  requireBinding(env.DB, 'News database is not configured.');

  const limit = parseLimit(url.searchParams.get('limit'));
  const columns = `
    id, date, title, menu_name, price, sales_time, body_ja, body_en,
    image_alt, image_url, source, published
  `;
  const statement = limit
    ? env.DB.prepare(`SELECT ${columns} FROM news WHERE published = 1 ORDER BY date DESC, id DESC LIMIT ?`).bind(limit)
    : env.DB.prepare(`SELECT ${columns} FROM news WHERE published = 1 ORDER BY date DESC, id DESC`);
  const result = await statement.all();

  return jsonResponse((result.results || []).map(mapNewsRowToClient));
}

async function handleNewsCreate(request, env) {
  requireMethod(request, ['POST']);
  requireBinding(env.DB, 'News database is not configured.');
  requireApiKey(request, env);

  let input;
  try {
    input = await request.json();
  } catch {
    throwHttpError(400, 'Request body must be valid JSON.');
  }

  const item = normalizeNewsInput(input);

  try {
    await env.DB.prepare(`
      INSERT INTO news (
        id, date, title, menu_name, price, sales_time, body_ja, body_en,
        image_alt, image_url, source, published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      item.id,
      item.date,
      item.title,
      item.menu_name,
      item.price,
      item.sales_time,
      item.body_ja,
      item.body_en,
      item.image_alt,
      item.image_url,
      item.source,
      item.published ? 1 : 0
    ).run();
  } catch (error) {
    if (/UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(error?.message || '')) {
      throwHttpError(409, 'Duplicate news id.');
    }
    throw error;
  }

  return jsonResponse({ success: true }, 201);
}

async function handleNewsUpload(request, env) {
  requireMethod(request, ['POST']);
  requireBinding(env.MEDIA, 'Image storage is not configured.');
  requireApiKey(request, env);

  const postId = normalizePostId(request.headers.get('x-post-id'));
  const contentType = normalizeContentType(request.headers.get('content-type'));
  const extension = SUPPORTED_IMAGE_TYPES[contentType];
  if (!extension) {
    throwHttpError(400, 'JPEG・PNG・WebP・GIFの画像を選択してください。');
  }

  const declaredLength = Number.parseInt(request.headers.get('content-length') || '0', 10);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throwHttpError(413, '画像は5MB以下にしてください。');
  }

  const image = await request.arrayBuffer();
  if (!image.byteLength || image.byteLength > MAX_IMAGE_BYTES) {
    throwHttpError(image.byteLength ? 413 : 400, image.byteLength ? '画像は5MB以下にしてください。' : '画像を選択してください。');
  }

  // R2/CDNの長期キャッシュに古い画像が残らないよう、更新ごとに必ず新しいキーを発行する。
  const version = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 8);
  const fileName = `${postId}-${version}-${suffix}.${extension}`;
  const key = `images/${fileName}`;

  const stored = await env.MEDIA.put(key, image, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable'
    }
  });
  if (!stored) {
    throwHttpError(500, '画像を保存できませんでした。');
  }

  const publicUrl = new URL(`/media/${key.split('/').map(encodeURIComponent).join('/')}`, request.url).toString();
  return jsonResponse({ success: true, url: publicUrl, fileName }, 201);
}

async function handleMedia(request, env, url) {
  requireMethod(request, ['GET', 'HEAD']);
  requireBinding(env.MEDIA, 'Image storage is not configured.');

  let key;
  try {
    key = url.pathname
      .slice('/media/'.length)
      .split('/')
      .map(decodeURIComponent)
      .join('/');
  } catch {
    throwHttpError(400, 'Invalid media path.');
  }

  if (!key || key.startsWith('/') || key.split('/').includes('..')) {
    throwHttpError(400, 'Invalid media path.');
  }

  const object = request.method === 'HEAD'
    ? await env.MEDIA.head(key)
    : await env.MEDIA.get(key);
  if (!object) {
    return new Response('Not found.', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('content-length', String(object.size));
  headers.set('cache-control', headers.get('cache-control') || 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');

  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
}

function requireMethod(request, allowed) {
  if (allowed.includes(request.method)) return;
  const error = new Error('Method not allowed.');
  error.statusCode = 405;
  error.headers = { Allow: allowed.join(', ') };
  throw error;
}

function requireApiKey(request, env) {
  const expectedKey = env.NEWS_API_KEY;
  if (!expectedKey) {
    throwHttpError(500, 'NEWS_API_KEY is not configured.');
  }

  const providedKey = request.headers.get('x-api-key');
  if (!providedKey || !isSameSecret(providedKey, expectedKey)) {
    throwHttpError(401, 'Unauthorized.');
  }
}

function isSameSecret(provided, expected) {
  const left = new TextEncoder().encode(provided);
  const right = new TextEncoder().encode(expected);
  if (left.length !== right.length) return false;

  let different = 0;
  for (let index = 0; index < left.length; index += 1) {
    different |= left[index] ^ right[index];
  }
  return different === 0;
}

function parseLimit(rawValue) {
  if (!rawValue) return undefined;
  const limit = Number.parseInt(rawValue, 10);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : undefined;
}

function normalizeNewsInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throwHttpError(400, 'Request body must be a JSON object.');
  }

  const item = {
    id: normalizeString(input.id, 'id'),
    date: normalizeString(input.date, 'date'),
    title: normalizeString(input.title, 'title'),
    menu_name: normalizeString(input.menu_name ?? input.menuName, 'menu_name'),
    price: normalizeString(input.price, 'price'),
    sales_time: normalizeString(input.sales_time ?? input.salesTime, 'sales_time'),
    body_ja: normalizeString(input.body_ja ?? input.bodyJa, 'body_ja'),
    body_en: normalizeString(input.body_en ?? input.bodyEn, 'body_en'),
    image_alt: normalizeString(input.image_alt ?? input.imageAlt, 'image_alt'),
    image_url: normalizeString(input.image_url ?? input.imageUrl, 'image_url'),
    source: normalizeString(input.source, 'source'),
    published: normalizePublished(input.published)
  };

  for (const field of ['id', 'date', 'title', 'body_ja']) {
    if (!item[field]) throwValidationError(`${field} is required.`, field);
  }

  validateId(item.id);
  validateDate(item.date);
  validateImageUrl(item.image_url);
  return item;
}

function normalizeString(value, fieldName) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throwValidationError(`${fieldName} must be a string.`, fieldName);
  const text = value.trim();
  if (text.length > MAX_FIELD_LENGTH) throwValidationError(`${fieldName} is too long.`, fieldName);
  return text;
}

function normalizePublished(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'boolean') throwValidationError('published must be a boolean.', 'published');
  return value;
}

function normalizePostId(value) {
  const postId = String(value || '');
  if (!/^roes-post-[a-zA-Z0-9-]{8,}$/.test(postId)) {
    throwHttpError(400, '投稿IDが正しくありません。');
  }
  return postId;
}

function normalizeContentType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function validateId(id) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,80}$/.test(id)) {
    throwValidationError('id must be 3-81 characters and use letters, numbers, hyphens, or underscores.', 'id');
  }
}

function validateDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throwValidationError('date must be in YYYY-MM-DD format.', 'date');
  }
  const [year, month, day] = date.split('-').map(part => Number.parseInt(part, 10));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throwValidationError('date must be a valid calendar date.', 'date');
  }
}

function validateImageUrl(imageUrl) {
  if (!imageUrl || imageUrl.startsWith('/') || imageUrl.startsWith('images/')) return;
  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return;
  } catch {
    throwValidationError('image_url must be an http(s) URL or a site-relative path.', 'image_url');
  }
  throwValidationError('image_url must be an http(s) URL or a site-relative path.', 'image_url');
}

function mapNewsRowToClient(row) {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    menuName: row.menu_name || '',
    price: row.price || '',
    salesTime: row.sales_time || '',
    bodyJa: row.body_ja || '',
    bodyEn: row.body_en || '',
    imageAlt: row.image_alt || row.title,
    imageUrl: row.image_url || '',
    source: row.source || '',
    published: Boolean(row.published)
  };
}

function requireBinding(binding, message) {
  if (!binding) throwHttpError(500, message);
}

function throwValidationError(message, field) {
  const error = new Error(message);
  error.statusCode = 400;
  error.details = { field };
  throw error;
}

function throwHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function jsonResponse(payload, status = 200) {
  const headers = new Headers(CORS_HEADERS);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), { status, headers });
}
