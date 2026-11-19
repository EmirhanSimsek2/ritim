import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDay,initialState,shiftDate,stateSchema,today} from '../src/lib/model.ts';
import {blockSchema,blocksSchema} from '../src/lib/timeline.ts';
import {applyPlanTemplate,completeEntryPlan,movePlanBlock,startPlanTimer} from '../src/lib/plan-actions.ts';
import {getPatch,patchSchema} from '../src/lib/patch.ts';

const date=today(),tomorrow=shiftDate(date,1);
const block={id:'fourier',lane:'activity',title:'5 Fourier sorusu çöz',start:660,end:705,category:'study',subject:'ss',status:'planned',approximate:false,notes:'',place:'Kütüphane',priority:true};
function state(){return {...initialState(),days:{[date]:{...blankDay(),pages:17,notes:'Gün notum',blocks:[block]},[tomorrow]:{...blankDay(),wake:'08:00'}}};}

test('Plan sayacı seçilen ders ve başlıkla başlar; planı tamamlamaz ve ikinci sayaç açılmaz',()=>{
  const before=state(),next=startPlanTimer(before,date,block.id,1234);
  assert.equal(next.timer.subject,'ss');assert.equal(next.timer.topic,block.title);
  assert.equal(next.timer.planId,block.id);assert.equal(next.timer.planDate,date);assert.equal(next.timer.runningSince,1234);
  assert.equal(next.days[date].blocks[0].status,'planned');assert.equal(next.entries.length,0);
  assert.equal(before.timer,null);assert.throws(()=>startPlanTimer(next,date,block.id));
  assert.throws(()=>startPlanTimer(before,tomorrow,block.id));
  assert.throws(()=>startPlanTimer({...before,days:{[date]:{...blankDay(),blocks:[{...block,subject:undefined}]}}},date,block.id));
  assert.ok(stateSchema.safeParse(next).success);
});

test('Oturum kaydı ve tamamlanma aynı yamada taşınır; planlanan süre gerçek süreye eklenmez',()=>{
  const before=startPlanTimer(state(),date,block.id);
  const entry={id:'session',date,kind:'study',subject:'ss',seconds:720,topic:block.title,method:'',focus:null,learning:'',result:'',attempted:null,correct:null,obstacle:'',planId:block.id,planDate:date};
  const next=completeEntryPlan({...before,timer:null,entries:[entry]},entry);
  const patch=getPatch(before,next);
  assert.equal(patch.config.timer,null);assert.equal(patch.entries.upsert[0].seconds,720);
  assert.equal(patch.days.upsert[date].blocks[0].status,'happened');
  assert.equal(next.days[date].pages,17);assert.equal(next.days[date].notes,'Gün notum');
  assert.ok(patchSchema.safeParse(patch).success);
  assert.equal(completeEntryPlan(next,{...entry,planId:'removed'}),next);
});

test('Günler arası erteleme kaynağı ve hedefi birlikte değiştirir, ilk plan ve günlükler korunur',()=>{
  const before=state();delete before.days[tomorrow].blocks;const next=movePlanBlock(before,date,block.id,tomorrow,780);
  assert.equal(next.days[date].blocks.length,0);assert.equal(next.days[tomorrow].blocks[0].start,780);
  assert.equal(next.days[tomorrow].blocks[0].end,825);assert.equal(next.days[tomorrow].blocks[0].original.date,date);
  assert.equal(next.days[date].pages,17);assert.equal(next.days[tomorrow].wake,'08:00');
  assert.equal(before.days[date].blocks.length,1);
  assert.deepEqual(Object.keys(getPatch(before,next).days.upsert).sort(),[date,tomorrow].sort());
  const later=movePlanBlock(next,tomorrow,block.id,shiftDate(tomorrow,1));
  assert.equal(later.days[shiftDate(tomorrow,1)].blocks[0].original.start,660);
});

test('Çakışan, taşan, tamamlanan veya aktif sayaçlı işi erteleme kaynak veriyi değiştirmez',()=>{
  const before=state();before.days[tomorrow].blocks=[{...block,id:'another'}];
  const snapshot=JSON.stringify(before);
  assert.throws(()=>movePlanBlock(before,date,block.id,tomorrow));assert.equal(JSON.stringify(before),snapshot);
  assert.throws(()=>movePlanBlock(before,date,block.id,tomorrow,1439));
  assert.throws(()=>movePlanBlock(startPlanTimer(state(),date,block.id),date,block.id,tomorrow));
  before.days[date].blocks[0]={...block,status:'happened'};
  assert.throws(()=>movePlanBlock(before,date,block.id,tomorrow));
});

test('Esnek işler saatli bloklarla çakışmaz; konumun saat aralığı zorunludur',()=>{
  const flexible={...block,id:'flexible',flexible:true,start:0,end:30};
  assert.ok(blocksSchema.safeParse([block,flexible,{...flexible,id:'second'}]).success);
  assert.equal(blockSchema.safeParse({...flexible,lane:'location'}).success,false);
  assert.equal(blockSchema.safeParse({...block,original:{date:'2026-99-01',start:0,end:30}}).success,false);
});

test('Haftalık gün şablonu aynı güne tekrar uygulandığında çoğalmaz; çakışmada atomik kalır',()=>{
  const before=state();before.planTemplates=[{id:'monday',name:'Dersli gün',weekday:1,blocks:[block]}];
  const next=applyPlanTemplate(before,tomorrow,'monday');
  assert.equal(next.days[tomorrow].blocks.length,1);assert.equal(next.days[tomorrow].blocks[0].status,'planned');
  assert.equal(applyPlanTemplate(next,tomorrow,'monday').days[tomorrow].blocks.length,1);
  assert.equal(next.days[tomorrow].wake,'08:00');assert.equal(before.days[tomorrow].blocks.length,0);
  assert.throws(()=>applyPlanTemplate(before,date,'monday'));assert.ok(stateSchema.safeParse(next).success);
  const cancelledOnly={...before,planTemplates:[{id:'empty',name:'Yalnız vazgeçilen',weekday:1,blocks:[{...block,status:'cancelled'}]}]};
  assert.throws(()=>applyPlanTemplate(cancelledOnly,tomorrow,'empty'),/uygulanabilecek aktif iş/);
});
