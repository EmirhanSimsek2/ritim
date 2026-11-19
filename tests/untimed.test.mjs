import test from 'node:test';
import assert from 'node:assert/strict';
import {entrySchema,initialState,stateSchema,summarise} from '../src/lib/model.ts';
import {getPatch,patchSchema} from '../src/lib/patch.ts';
const activity={id:'laundry',date:'2026-11-08',kind:'activity',subject:'Diğer',seconds:null,topic:'Çamaşır yıkadım',method:'',focus:null,learning:'',result:'',attempted:null,correct:null,obstacle:''};
test('Süre bilinmiyor yalnızca faaliyetlerde kabul edilir; sıfır ve geçersiz süre reddedilir',()=>{
  assert.ok(entrySchema.safeParse(activity).success);
  assert.equal(entrySchema.safeParse({...activity,kind:'study',subject:'de'}).success,false);
  for(const seconds of [0,-1,NaN,86401,1.5])assert.equal(entrySchema.safeParse({...activity,seconds}).success,false);
});
test('Karma ve yalnızca süresiz kayıtlar toplamları şişirmez; faaliyet varlığı korunur',()=>{
  const s=initialState();s.entries=[activity,{...activity,id:'walk',seconds:1200},{...activity,id:'study',kind:'study',subject:'de',seconds:1800},{...activity,id:'old',date:'2026-11-01'}];
  let r=summarise(s,'2026-11-02','2026-11-08');assert.equal(r.activityCount,2);assert.equal(r.untimedActivities,1);assert.equal(r.activitySeconds,1200);assert.equal(r.studySeconds,1800);
  r=summarise(s,'2026-11-01','2026-11-01');assert.equal(r.activityCount,1);assert.equal(r.untimedActivities,1);assert.equal(r.activitySeconds,0);assert.equal(r.entries.length,1);
});
test('Süresiz kayıt JSON yedeği ve yamada korunur; sonradan süre eklenebilir',()=>{
  const a=initialState(),b=structuredClone(a);b.entries=[activity];
  const imported=stateSchema.parse(JSON.parse(JSON.stringify(b)));assert.equal(imported.entries[0].seconds,null);
  assert.ok(patchSchema.safeParse(getPatch(a,b)).success);
  const c=structuredClone(b);c.entries[0].seconds=900;const p=getPatch(b,c);assert.equal(p.entries.upsert[0].seconds,900);assert.equal(p.config,undefined);
  assert.equal(summarise(c,'2026-11-08','2026-11-08').untimedActivities,0);
  assert.ok(stateSchema.safeParse({...a,entries:[{...activity,seconds:600}]}).success);
});
