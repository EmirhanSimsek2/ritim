import test from 'node:test';
import assert from 'node:assert/strict';
import {blockCategoryForPlan,blockSchema,blocksSchema,adjustBlock,clock,conflictingBlock,copyableBlocks,dayExample,planKind,toMinutes,coveredMinutes} from '../src/lib/timeline.ts';
import {blankDay,daySchema,initialState,stateSchema,summarise} from '../src/lib/model.ts';
import {getPatch,patchSchema} from '../src/lib/patch.ts';
const block={id:'school',lane:'location',title:'Okul',start:690,end:1320,category:'other',status:'planned',approximate:true,notes:''};
test('Konum/faaliyet aynı zamanda olabilir; aynı sütunda çakışma ve tekrar reddedilir',()=>{
  assert.ok(blocksSchema.safeParse([block,{...block,id:'codex',lane:'activity',title:'Codex',end:780}]).success);
  const next={...block,id:'dorm',title:'Yurt',start:1320,end:1440};assert.ok(blocksSchema.safeParse([block,next]).success);
  assert.equal(blocksSchema.safeParse([block,{...next,start:1319}]).success,false);
  assert.equal(blocksSchema.safeParse([block,block]).success,false);
  assert.equal(conflictingBlock([block],{...next,start:1319}).id,block.id);
});
test('Sürükleme 15 dakikaya yerleşir, süreyi korur, gün sınırlarını aşmaz',()=>{
  assert.deepEqual(adjustBlock(block,'move',22),{...block,start:705,end:1335});
  const start=adjustBlock(block,'move',-2000);assert.equal(start.start,0);assert.equal(start.end,630);
  const end=adjustBlock(block,'move',2000);assert.equal(end.end,1440);assert.equal(end.start,810);
  assert.equal(adjustBlock(block,'start',2000).start,1305);assert.equal(adjustBlock(block,'end',-2000).end,705);
  assert.equal(adjustBlock(block,'start',-2000).start,0);assert.equal(adjustBlock(block,'end',2000).end,1440);
});
test('Gece yarısı, gerçek saatler ve örnek 13.00 bitişi doğru işlenir',()=>{
  assert.equal(clock(1440),'24:00');assert.equal(toMinutes('13:00'),780);assert.ok(Number.isNaN(toMinutes('24:00')));
  assert.equal(blockSchema.safeParse({...block,start:1320,end:60}).success,false);
  const example=dayExample();assert.ok(blocksSchema.safeParse(example).success);assert.equal(example.find(b=>b.lane==='activity').end,780);
  assert.equal(coveredMinutes(example,'location'),840);assert.equal(coveredMinutes(example,'activity'),90);
});
test('Planlar çalışma istatistiklerine katılmaz, eski gün/yedekler kabul edilir',()=>{
  const s=initialState();s.days['2026-11-08']={...blankDay(),blocks:[block]};
  assert.equal(summarise(s,'2026-11-08','2026-11-08').studySeconds,0);assert.equal(summarise(s,'2026-11-08','2026-11-08').activityCount,0);
  const {blocks,...legacy}=blankDay();assert.deepEqual(daySchema.parse(legacy).blocks,[]);
  assert.deepEqual(stateSchema.parse(JSON.parse(JSON.stringify(s))).days['2026-11-08'].blocks,[block]);
  const patch=getPatch(initialState(),s);assert.equal(patch.config,undefined);assert.equal(patch.entries,undefined);assert.ok(patchSchema.safeParse(patch).success);
});
test('Kopyalama ve şablon seçimi vazgeçilenleri ve çakışan yapılmayanları atlar',()=>{
  const active={id:'a1',lane:'activity',title:'Fizik',start:540,end:600,category:'study',subject:'ss',status:'planned',approximate:false,notes:''};
  const missedOverlap={...active,id:'m1',title:'Eski matematik',status:'missed'};
  const cancelled={...active,id:'c1',title:'Vazgeçilen',start:660,end:720,status:'cancelled'};
  const missedFree={...active,id:'m2',title:'Tekrar denenecek',start:780,end:840,status:'missed'};
  const missedSecondOverlap={...active,id:'m3',title:'Çakışan ikinci yapılmadı',start:810,end:870,status:'missed'};
  const kept=copyableBlocks([missedOverlap,active,cancelled,missedFree,missedSecondOverlap]);
  assert.deepEqual(kept.map(b=>b.id),['a1','m2']);
  assert.ok(blocksSchema.safeParse(kept.map(b=>({...b,status:'planned'}))).success);
});
test('Gün planı türü ikili seçime iner ve arka planda şema kategorisini korur',()=>{
  assert.equal(planKind(undefined),'study');
  assert.equal(planKind('study'),'study');
  assert.equal(planKind('personal'),'activity');
  assert.equal(planKind('rest'),'activity');
  assert.equal(planKind('chores'),'activity');
  assert.equal(planKind('other'),'activity');
  assert.equal(blockCategoryForPlan('study','ss'),'study');
  assert.equal(blockCategoryForPlan('activity','Dinlenme'),'rest');
  assert.equal(blockCategoryForPlan('activity','Kişisel proje'),'personal');
  assert.equal(blockCategoryForPlan('activity','Spor','rest','Spor'),'rest');
  assert.equal(blockCategoryForPlan('activity','Diğer','chores','Diğer'),'chores');
  assert.equal(blockCategoryForPlan('activity','Oyun','rest','Spor'),'other');
  assert.equal(blockCategoryForPlan('activity','Spor','study','ss'),'other');
  assert.equal(blockCategoryForPlan('activity','','chores',''),'chores');
  assert.equal(blockCategoryForPlan('activity','','study','ss'),'other');
});
