const MAX_FIELD_LENGTH = 4000;

const NEWS_FIELDS = [
  'id',
  'date',
  'title',
  'menu_name',
  'price',
  'sales_time',
  'body_ja',
  'body_en',
  'image_alt',
  'image_url',
  'source',
  'published'
];

const REQUIRED_FIELDS = [
  'id',
  'date',
  'title',
  'body_ja'
];

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    const error = new Error('Supabase environment variables are not configured.');
    error.statusCode = 500;
    throw error;
  }

  return {
    url: url.replace(/\/+$/, ''),
    serviceRoleKey
  };
}

function getSupabaseHeaders(prefer) {
  const { serviceRoleKey } = getSupabaseConfig();
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

async function fetchPublishedNews(limit) {
  const { url } = getSupabaseConfig();
  const params = new URLSearchParams({
    select: NEWS_FIELDS.join(','),
    published: 'eq.true',
    order: 'date.desc,id.desc'
  });

  if (Number.isInteger(limit) && limit > 0) {
    params.set('limit', String(limit));
  }

  const response = await fetch(`${url}/rest/v1/news?${params.toString()}`, {
    headers: getSupabaseHeaders()
  });

  if (!response.ok) {
    await throwSupabaseError(response, 'Failed to fetch news.');
  }

  const rows = await response.json();
  return rows.map(mapNewsRowToClient);
}

async function insertNews(input) {
  const payload = normalizeNewsInput(input);
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/news`, {
    method: 'POST',
    headers: {
      ...getSupabaseHeaders('return=minimal'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    await throwSupabaseError(response, 'Failed to save news.');
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
    if (!item[field]) {
      throwValidationError(`${field} is required.`, field);
    }
  });

  validateId(item.id);
  validateDate(item.date);
  validateImageUrl(item.image_url);

  return item;
}

function normalizeString(value, fieldName) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value !== 'string') {
    throwValidationError(`${fieldName} must be a string.`, fieldName);
  }

  const text = value.trim();

  if (text.length > MAX_FIELD_LENGTH) {
    throwValidationError(`${fieldName} is too long.`, fieldName);
  }

  return text;
}

function normalizePublished(value) {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value !== 'boolean') {
    throwValidationError('published must be a boolean.', 'published');
  }

  return value;
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
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throwValidationError('date must be a valid calendar date.', 'date');
  }
}

function validateImageUrl(imageUrl) {
  if (!imageUrl || imageUrl.startsWith('/') || imageUrl.startsWith('images/')) {
    return;
  }

  try {
    const parsed = new URL(imageUrl);

    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return;
    }
  } catch (error) {
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

async function throwSupabaseError(response, fallbackMessage) {
  let details;

  try {
    details = await response.json();
  } catch (error) {
    details = null;
  }

  const isDuplicate = response.status === 409 || details?.code === '23505';
  const error = new Error(isDuplicate ? 'Duplicate news id.' : details?.message || fallbackMessage);
  error.statusCode = isDuplicate ? 409 : response.status;
  error.details = details || undefined;
  throw error;
}

function throwValidationError(message, field) {
  const error = new Error(message);
  error.statusCode = 400;

  if (field) {
    error.details = { field };
  }

  throw error;
}

module.exports = {
  fetchPublishedNews,
  insertNews
};
