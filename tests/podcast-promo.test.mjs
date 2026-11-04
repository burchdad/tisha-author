import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPodcastPromo, normalizePodcastPromo, preservePodcastPromo } from '../cms/podcast-promo.js';
import { defaultContent, normalizeContent } from '../server/content-store.js';
test('legacy snapshots acquire defaults without changing media', () => {
 const source=defaultContent();delete source.podcastPromo;
 const result=normalizeContent(source);
 assert.deepEqual(result.podcastPromo,defaultPodcastPromo);assert.deepEqual(result.media,source.media);
});
test('legacy editor saves preserve hidden custom promo and unrelated content',()=>{
 const source=defaultContent();delete source.podcastPromo;
 const current={podcastPromo:{...defaultPodcastPromo,title:'Custom show',visible:false}};
 const result=normalizeContent(preservePodcastPromo(source,current));
 assert.deepEqual(result.podcastPromo,current.podcastPromo);assert.deepEqual(result.media,source.media);
});
test('explicit changes take precedence and normalization is stable',()=>{
 const promo={...defaultPodcastPromo,title:' Changed ',visible:false};
 const result=normalizePodcastPromo(promo);
 assert.equal(result.title,'Changed');assert.equal(result.visible,false);
 assert.deepEqual(normalizePodcastPromo(result),result);
 assert.deepEqual(preservePodcastPromo({podcastPromo:promo},{podcastPromo:defaultPodcastPromo}).podcastPromo,promo);
});
test('unsafe/non-HTTPS/empty URLs are cleared',()=>{
 for(const url of ['javascript:alert(1)','http://example.com','//example.com','/local','https://user:pass@example.com','https://example.com/\\evil','https://example.com/\u007f',''])assert.equal(normalizePodcastPromo({url}).url,'');
});
