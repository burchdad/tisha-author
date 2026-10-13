// Preview and production can share a Blob store. Never let a review deployment
// publish content, restore a snapshot, or authorize an upload into that store.
export const isReadOnlyPreview = () => process.env.VERCEL_ENV === 'preview' ||
  (process.env.VERCEL === '1' && process.env.VERCEL_ENV !== 'production');

export function assertContentWritesAllowed() {
  if (!isReadOnlyPreview()) return;
  const error = new Error('This review preview is read-only. Website changes and uploads are disabled.');
  error.code = 'READ_ONLY_PREVIEW'; throw error;
}
