import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_BIN});
try {
  const page = await browser.newPage();
  const failed=[];
  page.on('pageerror',e=>failed.push(e.message));
  await page.route('http://localhost:8787/**', async route=>{
    const path=new URL(route.request().url()).pathname;
    if(!path.startsWith('/logger/')) {failed.push(path);return route.abort();}
    await route.fulfill({path:resolve('.',path.slice('/logger/'.length)||'index.html')});
  });
  await page.goto('http://localhost:8787/logger/');
  await expect(page.getByRole('heading',{name:'Aujourd’hui',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mensuration',exact:true}).click();
  await expect(page.locator('.body-figure canvas')).toBeVisible();
  await page.waitForFunction(()=>document.querySelector('canvas')?.style.height==='430px');
  if(failed.length)throw new Error(failed.join('\n'));
  console.log('GitHub Pages : chargement et silhouette sous /logger/ OK');
} finally {await browser.close();}
