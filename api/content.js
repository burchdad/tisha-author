import { readContent } from '../server/content-store.js';
import { methodNotAllowed, sendJson } from '../server/http.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
  try {
    const content = await readContent();
    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(content));
  } catch {
    sendJson(response, 503, { message: 'Website content is temporarily unavailable.' });
  }
}
