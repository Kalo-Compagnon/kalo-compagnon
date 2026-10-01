import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {Repository,type Doc} from '../src/persistence';

function backend(){
 const remote=new Map<string,{key:string;value:unknown;revision:number}>();
 let fail=false;
 const query={select(){return this;},eq(){return this;},order(){return this;},async range(first:number,last:number){if(fail)return {data:null,error:new Error('Offline')};return {data:structuredClone([...remote.values()].sort((a,b)=>a.key.localeCompare(b.key)).slice(first,last+1)),error:null};}};
 const client={from:()=>query,async rpc(_name:string,p:{p_key:string;p_value:unknown;p_revision:number}){if(fail)return {data:null,error:new Error('Offline')};const old=remote.get(p.p_key);if((old?.revision??0)!==p.p_revision)return {data:{accepted:false,value:old?.value??null,revision:old?.revision??0},error:null};const value={key:p.p_key,value:structuredClone(p.p_value),revision:p.p_revision+1};remote.set(p.p_key,value);return {data:{accepted:true,revision:value.revision},error:null};}} as unknown as SupabaseClient;
 return {client,remote,setOffline(v:boolean){fail=v;}};
}
test('Synchronisation : deux appareils, ajout, suppression et reprise après coupure',async()=>{
 const cloud=backend(),a=new Repository(cloud.client),b=new Repository(cloud.client);await a.load('sync-a');await b.load('sync-b');
 await a.update(s=>{s.entries.push({id:'meal-a',timestamp:1,type:'extra',foodName:'A',calories:20});});await a.sync();await b.sync();assert.equal(b.state.entries[0].foodName,'A');
 cloud.setOffline(true);await b.update(s=>{s.entries[0].calories=30;});await b.sync();assert.equal(b.state.entries[0].calories,30);assert.ok(b.docs.some(d=>d.pending));
 cloud.setOffline(false);await b.sync();await a.sync();assert.equal(a.state.entries[0].calories,30);
 await a.update(s=>{s.entries=[];});await a.sync();await b.sync();assert.equal(b.state.entries.length,0);
});
test('Synchronisation : un conflit conserve les deux versions jusqu’au choix explicite',async()=>{
 const cloud=backend(),a=new Repository(cloud.client),b=new Repository(cloud.client);await a.load('conflict-a');await b.load('conflict-b');await a.update(s=>{s.settings.deficitGoal=600;});await a.sync();await b.sync();
 await a.update(s=>{s.settings.deficitGoal=700;});await b.update(s=>{s.settings.deficitGoal=900;});await a.sync();await b.sync();
 const conflict=b.docs.find(d=>d.key==='settings/deficitGoal')!;assert.equal(conflict.value,900);assert.equal(conflict.conflict?.value,700);assert.equal(cloud.remote.get(conflict.key)?.value,700);
 await b.resolve(conflict.key,false);await a.sync();assert.equal(a.state.settings.deficitGoal,900);assert.equal(b.docs.find(d=>d.key===conflict.key)?.conflict,undefined);
});
