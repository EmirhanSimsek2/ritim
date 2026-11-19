import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,blankDay,summarise,getSleepHours,elapsed,weekStart,shiftDate,stateSchema,dateSchema} from '../src/lib/model.ts';

test('İlk hafta hedef ve değerlendirmeler boş başlar',()=>{
  const state=initialState();assert.equal(state.goals.from,'');assert.equal(state.goals.studyTotal,null);assert.equal(state.goals.pages,null);assert.equal(state.goals.sleepHours,null);assert.equal(blankDay().amEnergy,null);assert.equal(summarise(state,'2026-11-02','2026-11-08').focus,null);assert.ok(stateSchema.safeParse(state).success);
});
test('Gece yarısını geçen uyku doğru hesaplanır; eksik veya ters kayıt sayılmaz',()=>{
  const d={...blankDay(),sleepDate:'2026-11-06',bedtime:'23:30',wake:'07:15'};assert.equal(getSleepHours(d,'2026-11-07'),7.75);assert.equal(getSleepHours({...d,sleepDate:'2026-11-07'},'2026-11-07'),null);assert.equal(getSleepHours(blankDay(),'2026-11-07'),null);assert.equal(getSleepHours({...d,sleepDate:'2026-11-05'},'2026-11-07'),null);
});
test('Duraklama araları sayılmaz; Pomodoro arka planda 25 dakikada sınırlanır',()=>{
  const t={id:'t',kind:'study',subject:'de',topic:'',method:'',mode:'free',accumulated:60000,runningSince:100000,date:'2026-11-07'};assert.equal(elapsed(t,160000),120000);assert.equal(elapsed({...t,runningSince:null},900000),60000);assert.equal(elapsed({...t,mode:'pomo'},99000000),1500000);
});
test('Eksik puanlar ve soru sonuçları ortalamayı düşürmez',()=>{
  const s=initialState();const e={id:'a',date:'2026-11-07',kind:'study',subject:'de',seconds:3600,topic:'',method:'',focus:4,learning:'',result:'',attempted:10,correct:8,obstacle:''};s.entries=[e,{...e,id:'b',focus:null,correct:null,attempted:20},{...e,id:'c',date:'2026-11-01',focus:1}];s.days={'2026-11-07':{...blankDay(),pages:20}};const r=summarise(s,'2026-11-02','2026-11-08');assert.equal(r.studySeconds,7200);assert.equal(r.focus,4);assert.equal(r.focusCount,1);assert.equal(r.attempted,10);assert.equal(r.correct,8);assert.equal(r.pages,20);assert.equal(r.sleep,null);
});
test('Takvim haftası, ay ve yıl geçişleri doğru çalışır',()=>{assert.equal(weekStart('2026-11-08'),'2026-11-02');assert.equal(shiftDate('2026-12-31',1),'2027-01-01');assert.equal(dateSchema.safeParse('2026-02-30').success,false);});
test('Geçersiz soru sonucu ve boş değer yerine sıfır puan reddedilir',()=>{
  const s=initialState();s.days={'2026-11-07':{...blankDay(),amEnergy:0}};assert.equal(stateSchema.safeParse(s).success,false);
});
