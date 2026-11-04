import { test, expect } from '@playwright/test';
import { defaultContent } from '../server/content-store.js';
import { defaultPodcastPromo } from '../cms/podcast-promo.js';
for(const width of [390,1440]){
 test(`podcast public controls at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:1000});const data=defaultContent();delete data.podcastPromo;
  await page.route('**/api/content',r=>r.fulfill({json:data}));await page.goto('/#author');
  await expect(page.locator('.podcast-promo')).toBeVisible();
  await expect(page.locator('.podcast-promo a')).toHaveAttribute('href',defaultPodcastPromo.url);
  data.podcastPromo={...defaultPodcastPromo,title:'Changed show',label:'Play show',url:'https://example.com/show'};
  await page.reload();await expect(page.locator('.podcast-promo strong')).toHaveText('Changed show');
  await expect(page.locator('.podcast-promo a')).toHaveAttribute('href','https://example.com/show');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  data.podcastPromo.visible=false;await page.reload();await expect(page.locator('.podcast-promo')).toBeHidden();
  data.podcastPromo.visible=true;data.podcastPromo.url='javascript:alert(1)';await page.reload();await expect(page.locator('.podcast-promo')).toBeHidden();
 });
 test(`podcast editor preserves media at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:1000});let data=defaultContent();delete data.podcastPromo;const original=structuredClone(data.media);
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/admin/session')return route.fulfill({json:{authenticated:true,configured:true,readOnly:false}});
   if(path==='/api/admin/content'){
    if(route.request().method()==='PUT')data=route.request().postDataJSON();
    return route.fulfill({json:data});
   }
   if(path==='/api/admin/revisions')return route.fulfill({json:{revisions:[]}});
   return route.fulfill({status:403,json:{}});
  });
  await page.goto('/admin');await expect(page.getByLabel('Podcast HTTPS link')).toHaveValue(defaultPodcastPromo.url);
  await page.getByLabel('Podcast heading').fill('My new show');await page.getByLabel('Podcast HTTPS link').fill('https://example.com/show');
  await page.getByLabel('Show author podcast').selectOption('false');await page.locator('[data-save]:visible').first().click();
  await expect.poll(()=>data.podcastPromo?.visible).toBe(false);expect(data.media).toEqual(original);
  await page.reload();await expect(page.getByLabel('Podcast heading')).toHaveValue('My new show');await expect(page.getByLabel('Show author podcast')).toHaveValue('false');
 });
}
test('outages cannot reveal hidden promo',async({page})=>{
 await page.route('**/api/content',r=>r.fulfill({status:503,json:{}}));await page.goto('/');await expect(page.locator('.podcast-promo')).toBeHidden();
});
