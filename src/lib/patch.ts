import {z} from 'zod';
import {stateSchema,entrySchema,daySchema,habitDaySchema,dateSchema,type TrackerState} from './model.ts';
export const configSchema=stateSchema.omit({entries:true,days:true,habitDays:true});
export const patchSchema=z.object({
  config:configSchema.optional(),
  entries:z.object({upsert:z.array(entrySchema).max(20),remove:z.array(z.string().min(1).max(100)).max(20)}).optional(),
  days:z.object({upsert:z.record(dateSchema,daySchema),remove:z.array(dateSchema).max(20)}).optional(),
  habitDays:z.object({upsert:z.record(dateSchema,habitDaySchema),remove:z.array(dateSchema).max(20)}).optional(),
}).refine(p=>(p.entries?.upsert.length??0)+(p.entries?.remove.length??0)+Object.keys(p.days?.upsert??{}).length+(p.days?.remove.length??0)+Object.keys(p.habitDays?.upsert??{}).length+(p.habitDays?.remove.length??0)<=35,'Tek seferde en fazla 35 kayıt güncellenebilir.');
export type StatePatch=z.infer<typeof patchSchema>;
export function getPatch(previous:TrackerState,next:TrackerState):StatePatch{
  const {entries:oldEntries,days:oldDays,habitDays:oldHabitDays={},...oldConfig}=previous;
  const {entries,days,habitDays={},...config}=next;
  const patch:StatePatch={};
  if(JSON.stringify(config)!==JSON.stringify(oldConfig))patch.config=config;
  const oldMap=new Map(oldEntries.map(e=>[e.id,e]));const ids=new Set(entries.map(e=>e.id));
  const upsert=entries.filter(e=>JSON.stringify(e)!==JSON.stringify(oldMap.get(e.id))),remove=oldEntries.filter(e=>!ids.has(e.id)).map(e=>e.id);
  if(upsert.length||remove.length)patch.entries={upsert,remove};
  const changedDays=Object.fromEntries(Object.entries(days).filter(([d,v])=>JSON.stringify(v)!==JSON.stringify(oldDays[d]))),removedDays=Object.keys(oldDays).filter(d=>!days[d]);
  if(Object.keys(changedDays).length||removedDays.length)patch.days={upsert:changedDays,remove:removedDays};
  const changedHabitDays=Object.fromEntries(Object.entries(habitDays).filter(([d,v])=>JSON.stringify(v)!==JSON.stringify(oldHabitDays[d]))),removedHabitDays=Object.keys(oldHabitDays).filter(d=>!habitDays[d]);
  if(Object.keys(changedHabitDays).length||removedHabitDays.length)patch.habitDays={upsert:changedHabitDays,remove:removedHabitDays};
  return patch;
}
