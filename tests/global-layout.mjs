import {chromium,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN});
try {
  const page=await browser.newPage({viewport:{width:1583,height:964}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://localhost:8787/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(!path.startsWith('/logger/'))return route.abort();
    return route.fulfill({path:resolve('.',path.slice('/logger/'.length)||'index.html')});
  });
  await page.goto('http://localhost:8787/logger/');
  await page.getByRole('button',{name:'Exporter toutes mes données (.csv)',exact:true}).click();
  const rows=['record_type;date;id;name;calories;basal_kcal;target_kcal;steps'];
  for(let i=0;i<30;i++){
    const d=new Date();d.setDate(d.getDate()-i);
    const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    rows.push(`DAILY_SUMMARY;${date};;;;1857.5;2000;5000`);
    rows.push(`FOOD_LOG;${date};layout-${i};Exemple;1446.7;;;`);
  }
  await page.locator('input[type=file]').setInputFiles({name:'layout-synthetic.csv',mimeType:'text/csv',buffer:Buffer.from(rows.join('\n'))});
  await page.getByRole('button',{name:'Importer après vérification',exact:true}).click();
  await page.getByRole('button',{name:'Confirmer',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'Global',exact:true}).click();
  await expect(page.locator('.net')).toContainText('kcal');
  mkdirSync('qa',{recursive:true});
  for(const width of [1583,900,1920,2560,390]){
    await page.setViewportSize({width,height:width===390?844:964});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const dimensions=await page.evaluate(()=>{
      const columns=[...document.querySelectorAll('.global-grid > div')].map(e=>e.getBoundingClientRect().width);
      const chart=document.querySelector('.chart-scroll');
      return {columns,pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,chartWidth:chart.clientWidth,chartContent:chart.scrollWidth,values:[...document.querySelectorAll('.stat-card .value')].map(e=>e.getBoundingClientRect().height)};
    });
    assert.ok(dimensions.pageWidth<=dimensions.viewport,`Page trop large : ${width}`);
    if(width>=900){assert.ok(Math.abs(dimensions.columns[0]-dimensions.columns[1])<2);assert.ok(dimensions.columns[0]>=350);}
    assert.ok(dimensions.chartContent>dimensions.chartWidth,'Le graphique long doit défiler dans sa carte');
    assert.ok(dimensions.values.every(h=>h<70),'Les chiffres doivent rester lisibles');
    await page.locator('.chart-scroll').evaluate(e=>{e.scrollLeft=0});
    await page.screenshot({path:`qa/global-history-${width}.png`,animations:'disabled'});
    await page.locator('.history-card').screenshot({path:`qa/history-readability-${width}.png`,animations:'disabled'});
  }
  assert.deepEqual(errors,[]);
  console.log('Global : 30 journées, colonnes équilibrées et défilement du graphique vérifiés aux 5 largeurs.');
}finally{await browser.close();}
