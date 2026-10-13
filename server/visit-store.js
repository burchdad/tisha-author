import { VisitError, validId } from './visit-model.js';

export function createVisitStore(loadSdk = () => import('@vercel/blob')) {
  const options = () => process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : {};
  const path = (id) => { if (!validId(id)) throw new VisitError('Invalid request ID.'); return `school-visits/${id}.json`; };
  return {
    async read(id) {
      const { get } = await loadSdk();
      const blob = await get(path(id), { access: 'private', useCache: false, ...options() });
      if (!blob) return null;
      if (blob.statusCode !== 200 || !blob.blob?.etag) throw new Error('Unable to read a current visit revision.');
      return { record: JSON.parse(await new Response(blob.stream).text()), etag: blob.blob.etag };
    },
    async write(record, etag) {
      const { put, BlobPreconditionFailedError } = await loadSdk();
      try {
        return await put(path(record.id), JSON.stringify(record), { access: 'private', addRandomSuffix: false, allowOverwrite: Boolean(etag), ...(etag ? { ifMatch: etag } : {}), contentType: 'application/json', cacheControlMaxAge: 60, ...options() });
      } catch (error) {
        if (BlobPreconditionFailedError && error instanceof BlobPreconditionFailedError) throw new VisitError('This request changed. Reload and try again.', 409);
        throw error;
      }
    },
  };
}
