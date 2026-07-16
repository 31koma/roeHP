const crypto = require('node:crypto');
const { insertNews } = require('../../lib/news-store');

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
    await insertNews(parseRequestBody(request.body));
    response.status(201).json({ success: true });
  } catch (error) {
    console.error('[news] Failed to create news:', error.name, error.message);
    response.status(error.statusCode || 500).json({
      success: false,
      reason: error.statusCode ? error.message : 'Internal server error.',
      details: error.details || undefined
    });
  }
};

function parseRequestBody(body) {
  if (!body || typeof body === 'object') {
    return body;
  }

  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString());
    } catch (error) {
      const parseError = new Error('Request body must be valid JSON.');
      parseError.statusCode = 400;
      throw parseError;
    }
  }

  const error = new Error('Request body must be a JSON object.');
  error.statusCode = 400;
  throw error;
}

function requireApiKey(request) {
  const expectedKey = process.env.NEWS_API_KEY;

  if (!expectedKey) {
    const error = new Error('NEWS_API_KEY is not configured.');
    error.statusCode = 500;
    throw error;
  }

  const providedKey = request.headers['x-api-key'];

  if (!isSameSecret(providedKey, expectedKey)) {
    const error = new Error('Unauthorized.');
    error.statusCode = 401;
    throw error;
  }
}

function isSameSecret(providedKey, expectedKey) {
  if (!providedKey || typeof providedKey !== 'string') {
    return false;
  }

  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(expectedKey);

  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
}
