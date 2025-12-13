const axios = require('axios');

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;

async function fetchLatestTaxNews() {
  if (!SERPAPI_API_KEY) {
    console.warn('⚠️ SERPAPI_API_KEY is not set. Tax news polling is disabled.');
    return [];
  }

  try {
    const params = {
      api_key: SERPAPI_API_KEY,
      engine: 'google_news',
      q: 'tax news Nigeria OR Africa',
      hl: 'en',
      gl: 'ng',
      sort_by: 'date',
    };

    const { data } = await axios.get('https://serpapi.com/search.json', { params });

    const items = data.news_results || data.articles || [];

    return items.slice(0, 5).map((item) => ({
      title: item.title,
      link: item.link,
      source: item.source || item.publisher?.name,
      snippet: item.snippet || item.subtitle || item.content,
      date: item.date || item.published_date,
    }));
  } catch (error) {
    console.error('❌ Error fetching tax news from SerpApi:', error.response?.data || error.message || error);
    return [];
  }
}

module.exports = {
  fetchLatestTaxNews,
};