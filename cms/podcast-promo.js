export const defaultPodcastPromo = {
  visible: true,
  title: 'unEDited chatter',
  description: 'Join Dr. Tisha Shipley and Dr. Stephanie Heald for conversations about education.',
  label: 'Listen to unEDited chatter',
  url: 'https://podcasts.apple.com/au/podcast/unedited-chatter/id1846488817',
};
export function podcastUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/.test(value)) return '';
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
  } catch { return ''; }
}
// Legacy snapshots acquire defaults without rewriting storage.
export function normalizePodcastPromo(value) {
  const source = value && typeof value === 'object' ? value : {};
  const result = { visible: source.visible !== false };
  for (const [key, max] of [['title', 200], ['description', 1000], ['label', 200], ['url', 2048]]) {
    result[key] = typeof source[key] === 'string' ? source[key].trim().slice(0, max) : defaultPodcastPromo[key];
  }
  result.url = podcastUrl(result.url);
  return result;
}
export function preservePodcastPromo(input, current) {
  return { ...input, podcastPromo: input.podcastPromo ?? current.podcastPromo };
}
