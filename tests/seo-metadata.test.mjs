import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const origin = 'https://www.ridersmagicmark.com';
for (const [file, path] of [['index.html', '/'], ['curriculum.html', '/curriculum.html']]) {
  test(`${file} uses the verified public domain`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(html.includes(`<link rel="canonical" href="${origin}${path}"`));
    assert.ok(html.includes(`<meta property="og:url" content="${origin}${path}"`));
    assert.ok(!html.includes('tisha-author.vercel.app'));
  });
}
test('sitemap contains only the two public pages and robots advertises it', () => {
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]), [origin + '/', origin + '/curriculum.html']);
  assert.ok(readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8').includes(`Sitemap: ${origin}/sitemap.xml`));
});
