# Event-folder albums

## Scope

Adds public Past Events folders and an album-aware author editor on top of the
existing private Blob content snapshots and admin session/origin checks. The
existing school-visit/email work remains on its separate held review branch.
No sender, calendar, school-visit, authentication, or production configuration
changes are included. Publishing this review branch requires separate approval.

## Data and compatibility

- `eventAlbums`: `{ id, title, date, coverPhotoId }` records. IDs start with `album_`;
  dates are optional ISO calendar dates. Cover IDs must identify a photo in that album.
- `gallery`: existing photo records retain URL, title, caption, alt text, and date,
  plus `id` and `eventId`. IDs start with `photo_`; blank eventId means Unassigned.
- Old snapshots acquire deterministic photo IDs in the read response only. Nothing
  is written until the author explicitly saves. Duplicate legacy URLs remain
  separate entries, distinguished by occurrence.
- Older open dashboard clients that omit `eventAlbums` cannot strip album metadata
  or omit saved photos. Reload to use the album-aware removal/reassignment controls.
- More than 100 photos are no longer silently truncated. New limits are 100 albums
  and 1,000 photos; over-limit requests fail instead of trimming data.
- The admin API returns a revision marker; an album-aware save with an outdated
  marker returns 409. This detects already-completed competing saves, not perfectly
  simultaneous writes. Do not use multiple editing sessions concurrently.
- Revision restore is intentionally a full snapshot restore, including its exact
  albums and photos. Restoring a pre-album snapshot returns its photos to Unassigned.

## Security and release gates

Public markup uses text nodes and URL validation. The admin escapes dynamic values.
Album IDs, photo IDs, duplicate IDs, event membership, and cover membership are
validated on the server. Existing authentication and same-origin checks remain.
Vercel `VERCEL_ENV=preview` disables content writes, upload token signing, and
revision restore, protecting a shared live Blob store during review.

Before production release: approve the preview design; review test/build results;
merge only this branch's album changes; then perform an explicitly authorized
production author workflow. Do not merge the held visits/email branch as a shortcut.
No live upload, content save, auth email, calendar action, or new photograph is
needed for the read-only preview review.
