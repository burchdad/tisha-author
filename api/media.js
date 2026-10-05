import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { methodNotAllowed, sendJson } from '../server/http.js';

const allowedPathname = /^uploads\/[a-zA-Z0-9._-]{1,180}$/;

export default async function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
  const pathname = typeof request.query?.pathname === 'string' ? request.query.pathname : '';
  if (!allowedPathname.test(pathname)) return sendJson(response, 400, { message: 'Invalid media path.' });
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result) return sendJson(response, 404, { message: 'File not found.' });
    if (result.statusCode === 304) { response.statusCode = 304; return response.end(); }
    response.statusCode = 200;
    response.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream');
    response.setHeader('Content-Length', String(result.blob.size));
    response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
    response.setHeader('ETag', result.blob.etag);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    Readable.fromWeb(result.stream).pipe(response);
  } catch (error) {
    console.error('Private media delivery failed', { pathname, message: error?.message });
    sendJson(response, 502, { message: 'File is temporarily unavailable.' });
  }
}
