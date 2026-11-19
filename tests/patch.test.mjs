import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,blankDay} from '../src/lib/model.ts';
import {getPatch,patchSchema} from '../src/lib/patch.ts';
test('Günlük değişikliği geçmiş oturumları tekrar göndermez',()=>{const a=initialState(),b=structuredClone(a);b.days['2026-11-08']={...blankDay(),pages:20};const p=getPatch(a,b);assert.equal(p.entries,undefined);assert.equal(p.config,undefined);assert.equal(p.days.upsert['2026-11-08'].pages,20);assert.ok(patchSchema.safeParse(p).success);});
test('Sayaçtan bitirme, yeni oturum ve sayaç değişikliğini birlikte taşır',()=>{const a=initialState();a.timer={id:'t',kind:'study',subject:'de',topic:'',method:'',mode:'free',accumulated:60000,runningSince:null,date:'2026-11-08'};const b=structuredClone(a);b.timer=null;b.entries.push({id:'e',date:'2026-11-08',kind:'study',subject:'de',seconds:60,topic:'',method:'',focus:null,learning:'',result:'',attempted:null,correct:null,obstacle:''});const p=getPatch(a,b);assert.equal(p.config.timer,null);assert.equal(p.entries.upsert.length,1);assert.ok(patchSchema.safeParse(p).success);});
test('Silinen kayıt kimliği yama içinde korunur',()=>{const a=initialState();a.days['2026-11-08']=blankDay();const b=structuredClone(a);delete b.days['2026-11-08'];assert.deepEqual(getPatch(a,b).days.remove,['2026-11-08']);});
