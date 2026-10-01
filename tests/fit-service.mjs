// Integration check; start npm run serve first. This creates synthetic FIT data only.
import {Encoder,Profile} from '@garmin/fitsdk';
import assert from 'node:assert/strict';
const encoder=new Encoder();
encoder.writeMesg({mesgNum:0,type:'monitoringA',manufacturer:'garmin',product:1,serialNumber:1,timeCreated:new Date('2026-09-30T00:00:00Z')});
encoder.writeMesg({mesgNum:103,timestamp:new Date('2026-09-30T00:00:00Z'),localTimestamp:(Date.parse('2026-09-30T00:00:00Z')-631065600000)/1000,activityType:['walking'],cyclesToDistance:[1],cyclesToCalories:[.045],restingMetabolicRate:1800});
for(const [hour,steps,calories]of [[0,0,0],[12,1000,45],[23,2000,90]])encoder.writeMesg({mesgNum:55,timestamp:new Date(`2026-09-30T${String(hour).padStart(2,'0')}:00:00Z`),activityType:'walking',cycles:steps,activeCalories:calories});
const bytes=encoder.close();
const response=await fetch('http://localhost:8787/api/fit-monitoring',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Time-Zone':'UTC'},body:bytes});
const metrics=await response.json();assert.equal(response.status,200,JSON.stringify(metrics));assert.ok(Array.isArray(metrics)&&metrics.length>0);assert.equal(metrics.reduce((s,m)=>s+m.steps,0),2000);assert.equal(metrics.reduce((s,m)=>s+m.calories,0),90);console.log('FIT monitoring : 2000 pas, 90 kcal, décodés par le SDK Garmin Android.');
