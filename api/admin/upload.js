import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';
import { hasSameOrigin, isAuthenticated } from '../../server/admin-auth.js';
import { methodNotAllowed, readJson, sendJson } from '../../server/http.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
  try {
    const body = await readJson(request);
    if (!isAuthenticated(request)) return sendJson(response, 401, { message: 'Please sign in again.' });
    if (!hasSameOrigin(request)) return sendJson(response, 403, { message: 'Request rejected.' });
    const result = await handleUploadPresigned({
      request, body,
      getSignedToken: async (pathname) => {
        const fileName = pathname.split('/').pop();
        if (!pathname.startsWith('uploads/') || pathname.includes('..') || !fileName || !/^[a-zA-Z0-9._-]{1,180}$/.test(fileName)) throw new Error('Invalid file name.');
        const allowedContentTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        const maximumSizeInBytes = 15 * 1024 * 1024;
        return {
          token: await issueSignedToken({ pathname, operations: ['put'], allowedContentTypes, maximumSizeInBytes }),
          urlOptions: { allowedContentTypes, maximumSizeInBytes, addRandomSuffix: true },
        };
      },
    });
    sendJson(response, 200, result);
  } catch (error) {
    console.error('Dashboard upload authorization failed', { message: error?.message, name: error?.name });
    sendJson(response, 400, { message: error.message || 'The file could not be uploaded.' });
  }
}
