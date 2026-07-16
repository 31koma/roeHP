const { fetchPublishedNews } = require('../lib/news-store');

module.exports = async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, OPTIONS');
    response.status(405).json({ success: false, reason: 'Method not allowed.' });
    return;
  }

  try {
    const limit = parseLimit(request.query?.limit);
    const news = await fetchPublishedNews(limit);
    response.status(200).json(news);
  } catch (error) {
    response.status(error.statusCode || 500).json({
      success: false,
      reason: error.statusCode ? error.message : 'Internal server error.',
      details: error.details || undefined
    });
  }
};

function parseLimit(value) {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (!rawValue) {
    return undefined;
  }

  const limit = Number.parseInt(rawValue, 10);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : undefined;
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
