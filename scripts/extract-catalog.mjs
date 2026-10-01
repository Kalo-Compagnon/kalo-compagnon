import {readFileSync,writeFileSync} from 'node:fs';
const source=readFileSync('../app/src/main/java/com/lowtaire/logger/ui/MealCatalog.kt','utf8');
function split(s){const result=[];let start=0,depth=0,quote=false;for(let i=0;i<s.length;i++){if(s[i]==='"'&&s[i-1]!=='\\')quote=!quote;if(quote)continue;if(s[i]==='(')depth++;if(s[i]===')')depth--;if(s[i]===','&&depth===0){result.push(s.slice(start,i).trim());start=i+1;}}result.push(s.slice(start).trim());return result;}
const vars={};
function ingredient(expression){const copy=expression.match(/^(\w+)\.copy\(defaultQuantity = ([\d.]+)f\)$/);if(copy)return {...vars[copy[1]],defaultQuantity:Number(copy[2])};if(vars[expression])return vars[expression];const match=expression.match(/^i\((.*)\)$/);if(!match)throw new Error(expression);const p=split(match[1]);return {key:JSON.parse(p[0]),name:JSON.parse(p[1]),caloriesPer100:Number(p[2].replace(/f$/,'')),defaultQuantity:Number(p[3].replace(/f$/,'')),unit:p[4]?JSON.parse(p[4]):'g',perUnit:p[5]==='perUnit = true'};}
for(const match of source.matchAll(/private val (\w+) = (i\([^\n]+\))/g))vars[match[1]]=ingredient(match[2]);
const families=[...source.matchAll(/MealFamily\(MealFamilyId\.(\w+), "([^"]+)", "([^"]+)"\)/g)].map(m=>({id:m[1],name:m[2],shortName:m[3]}));
const dishes=[];for(const line of source.split('\n')){const match=line.trim().match(/^(dish|extra)\((.*)\),?$/);if(!match)continue;const p=split(match[2]);if(match[1]==='extra')dishes.push({id:JSON.parse(p[0]),family:'EXTRAS',name:JSON.parse(p[1]),ingredients:[],isExtra:true});else dishes.push({id:JSON.parse(p[0]),family:p[1].replace('MealFamilyId.',''),name:JSON.parse(p[2]),ingredients:p.slice(3).map(ingredient),isExtra:false});}
dishes.push({id:'extra_photo',family:'EXTRAS',name:'Photo uniquement',ingredients:[],isExtra:true});
writeFileSync('src/legacy_catalog.json',JSON.stringify({families,dishes},null,2));console.log(`${families.length} familles, ${dishes.length} plats extraits du code Android.`);
