const { list, put } = require('@vercel/blob');

const MAX_FIELD_LENGTH = 4000;
const NEWS_PREFIX = 'news/';

const REQUIRED_FIELDS = ['id', 'date', 'title', 'body_ja'];

async function fetchPublishedNews(limit) {
  requireBlobStore();
  const result = await list({ prefix: NEWS_PREFIX, limit: 1000, mode: 'expanded' });
  const rows = await Promise.all(result.blobs
    .filter(blob => blob.pathname.endsWith('.json'))
    .map(async blob => {
      const response = await fetch(blob.url, { cache: 'no-store' });
      if (!response.ok) return null;
      return response.json().catch(() => null);
    }));

  const published = rows
    .filter(row => row && row.published !== false)
    .map(mapNewsRowToClient)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return Number.isInteger(limit) && limit > 0 ? published.slice(0, limit) : published;
}

async function insertNews(input) {
  requireBlobStore();
  const payload = normalizeNewsInput(input);
  const pathname = `${NEWS_PREFIX}${payload.id}.json`;
  const existing = await list({ prefix: pathname, limit: 1, mode: 'expanded' });
  if (existing.blobs.some(blob => blob.pathname === pathname)) {
    const error = new Error('Duplicate news id.');
    error.statusCode = 409;
    throw error;
  }

  await put(pathname, JSON.stringify(payload), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: 'application/json; charset=utf-8'
  });
}

function requireBlobStore() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const error = new Error('News storage is not configured.');
    error.statusCode = 500;
    throw error;
  }
}

function normalizeNewsInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throwValidationError('Request body must be a JSON object.');
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

  REQUIRED_FIELDS.forEach(field => {
    if (!item[field]) throwValidationError(`${field} is required.`, field);
  });

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

function validateId(id) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,80}$/.test(id)) {
    throwValidationError('id must be 3-81 characters and use letters, numbers, hyphens, or underscores.', 'id');
  }
}

function validateDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throwValidationError('date must be in YYYY-MM-DD format.', 'date');
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
    published: row.published
  };
}

function throwValidationError(message, field) {
  const error = new Error(message);
  error.statusCode = 400;
  if (field) error.details = { field };
  throw error;
}

module.exports = { fetchPublishedNews, insertNews };
