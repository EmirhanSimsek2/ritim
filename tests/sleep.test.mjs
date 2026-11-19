import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDay,getSleepHours,getSleepError,inferSleepDate,initialState,stateSchema,summarise} from '../src/lib/model.ts';

test('02.30–08.00 aynı takvim günü; 23.30–08.00 önceki günden başlar',()=>{
  for(const [bedtime,sleepDate,hours] of [['02:30','2026-11-08',5.5],['23:30','2026-11-07',8.5]]){
    assert.equal(inferSleepDate(bedtime,'08:00','2026-11-08'),sleepDate);
    const d={...blankDay(),bedtime,wake:'08:00',sleepDate};
    assert.equal(getSleepHours(d,'2026-11-08'),hours);assert.equal(getSleepError(d,'2026-11-08'),null);
  }
});
test('Kısmi kayıt kaydedilir ve süre tahmin edilmez',()=>{
  for(const partial of [{wake:'08:00'},{bedtime:'02:30'},{bedtime:'23:30',sleepDate:'2026-11-07'}]){
    const d={...blankDay(),...partial};assert.equal(getSleepError(d,'2026-11-08'),null);assert.equal(getSleepHours(d,'2026-11-08'),null);
    assert.equal(stateSchema.safeParse({...initialState(),days:{'2026-11-08':d}}).success,true);
  }
  assert.equal(inferSleepDate('','08:00','2026-11-08'),'');
});
test('Ters, sıfır ve 24 saatten uzun aralık reddedilir; 24 saat kabul edilir',()=>{
  const d={...blankDay(),bedtime:'02:30',wake:'08:00',sleepDate:'2026-11-07'};
  assert.ok(getSleepError(d,'2026-11-08'));
  assert.ok(getSleepError({...d,sleepDate:'2026-11-09'},'2026-11-08'));
  assert.ok(getSleepError({...d,sleepDate:'2026-11-08',bedtime:'08:00'},'2026-11-08'));
  assert.equal(getSleepError({...d,bedtime:'08:00'},'2026-11-08'),null);
  assert.equal(getSleepHours({...d,bedtime:'08:00'},'2026-11-08'),24);
});
test('Ay/yıl sınırı ve gündüz uykusu doğru; haftalık sonuç kalkış gününe aittir',()=>{
  assert.equal(inferSleepDate('23:30','08:00','2027-01-01'),'2026-12-31');
  assert.equal(inferSleepDate('13:00','15:00','2026-11-08'),'2026-11-08');
  const s=initialState();s.days={'2026-11-09':{...blankDay(),sleepDate:'2026-11-08',bedtime:'23:00',wake:'07:00'},'2026-11-10':{...blankDay(),wake:'08:00'}};
  assert.equal(summarise(s,'2026-11-02','2026-11-08').sleep,null);
  const r=summarise(s,'2026-11-09','2026-11-15');assert.equal(r.sleep,8);assert.equal(r.sleepDays,1);
});
