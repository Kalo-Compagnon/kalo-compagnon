// Local fixture only. This script never authenticates or writes to Supabase.
import { mkdir, writeFile } from 'node:fs/promises';
import { initialState, shiftDay, calculateBasal, mealTotals, type Entry } from '../src/domain';
import { exportJSON, importJSON } from '../src/transfer';

const end = process.argv[2] ?? '2026-11-05';
if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error('Date attendue : YYYY-MM-DD');
const state = initialState();
state.settings = {...state.settings, displayName:'Alex · Démo', profileCompleted:true,
  first:shiftDay(end,-27), birthDate:'1994-04-12', sex:'male', age:32,
  height:178, weight:78.6, basal:calculateBasal('male',32,178,78.6),
  target:2200, deficitGoal:300, haloColor:'#a89ae5', theme:'system'};
state.foods = [
  ['demo-food-oats','Flocons d’avoine',372,13,59,7],
  ['demo-food-yogurt','Yaourt nature',60,4,5,3],
  ['demo-food-rice','Riz cuit',130,3,28,0.3],
  ['demo-food-chicken','Poulet cuit',165,31,0,3.6],
].map(([id,name,kcal,protein,carbs,fat]) => ({id:String(id),name:String(name),category:'Autres',
  kcalPer100:Number(kcal),proteinPer100:Number(protein),carbsPer100:Number(carbs),fatPer100:Number(fat),
  referenceUnit:'g',isFavorite:true,usageCount:8,isCustom:true}));
const ingredients = [
  {id:'demo-part-rice',foodId:'demo-food-rice',quantity:180,isVariable:true},
  {id:'demo-part-chicken',foodId:'demo-food-chicken',quantity:150,isVariable:true},
];
const totals=mealTotals(ingredients,state.foods);
state.meals=[{id:'demo-meal-bowl',name:'Bol riz et poulet · Démo',ingredients,
  cachedCalories:totals[0],cachedProtein:totals[1],cachedCarbs:totals[2],cachedFat:totals[3],
  isFavorite:true,usageCount:6,createdAt:new Date(`${state.settings.first}T12:00:00+02:00`).getTime(),
  notes:'Recette fictive pour la démonstration.'}];
for(let i=0;i<28;i++) {
  const day=shiftDay(end,i-27);
  const stamp=(hour:number)=>new Date(`${day}T${String(hour).padStart(2,'0')}:00:00+01:00`).getTime();
  const weight=Math.round((80.2-i*0.06+[0,0.15,-0.1,0.05][i%4])*10)/10;
  state.days[day]={basal:calculateBasal('male',32,178,weight),target:2200,
    steps:3800+(i*347)%6200,manualActivityCalories:i%4===0?120+(i%3)*35:0,
    ...(i%2===0||i===27 ? {weightKg:weight}:{}),
  };
  if(i%7===0||i===27) {
    const values={'Épaules':112,'Poitrine':100-i*0.04,'Bras':33,'Taille':88-i*0.06,
      'Ventre':92-i*0.05,'Hanches':99,'Cuisse':56,'Mollet':37};
    for(const key of Object.keys(values)) values[key as keyof typeof values]=Math.round(values[key as keyof typeof values]*10)/10;
    state.days[day].measurements=values;
    state.days[day].measurementHistory=[{timestamp:stamp(8),values}];
    state.physical.push({id:`demo-physical-${day}`,timestamp:stamp(8),waistCm:values.Taille,weightKg:weight});
  }
  if(i%3===0) {
    Object.assign(state.days[day],{fitSteps:2400,fitCoveredSteps:2400,fitCalories:210});
    state.imports.push({id:`demo-fit-${day}`,timestamp:stamp(18),name:'Marche · Simulation FIT',size:24000,
      hash:`demo-hash-${day}`,fingerprints:[`demo-fingerprint-${day}`],days:[day],steps:2400,coveredSteps:2400,calories:210});
  }
  const meals: [number,string,string,number][]=[
    [8,'meal','Petit déjeuner · avoine et yaourt',390+(i%3)*30],
    [12,'meal','Déjeuner · riz, poulet et légumes',640+(i%4)*25],
    [16,'snack','Collation · fruit et amandes',180+(i%2)*40],
    [20,'meal','Dîner · poisson, pommes de terre et légumes',610+(i%5)*20],
  ];
  for(const [hour,type,name,calories] of meals) {
    const entry:Entry={id:`demo-entry-${day}-${hour}`,timestamp:stamp(hour),type,foodName:name,
      calories,proteinGrams:Math.round(calories*0.22/4),carbsGrams:Math.round(calories*0.48/4),
      fatGrams:Math.round(calories*0.3/9),note:'Donnée fictive de démonstration.'};
    state.entries.push(entry);
  }
}
const json=exportJSON(state);
importJSON(json); // Validate with the application's real importer before delivery.
await mkdir('demo',{recursive:true});
await writeFile('demo/kalo-demo.json',json);
console.log(`Fichier démo validé : ${Object.keys(state.days).length} journées, ${state.entries.length} entrées, ${state.imports.length} activités FIT simulées.`);
