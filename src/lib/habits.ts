import {shiftDate,today,type Habit,type TrackerState} from './model.ts';
export function scheduleAt(habit:Habit,date:string){return [...habit.schedules].reverse().find(s=>s.from<=date);}
export function isPaused(habit:Habit,date:string){return habit.pauses.some(p=>p.from<=date&&(p.to===null||date<p.to));}
export function isPlanned(habit:Habit,date:string){const s=scheduleAt(habit,date);return !!s&&!isPaused(habit,date)&&s.days.includes(new Date(date+'T12:00:00Z').getUTCDay());}
export function previousPlanned(habit:Habit,date:string){for(let i=1;i<=366;i++){const d=shiftDate(date,-i);if(d<habit.schedules[0].from)return null;if(isPlanned(habit,d))return d;}return null;}
export function habitSummary(habit:Habit,days:TrackerState['habitDays'],from:string,to:string,cutoff=today()){
  const result={planned:0,done:0,minimum:0,missed:0,skip:0,unknown:0,extra:0};
  for(let d=from;d<=to&&d<=cutoff;d=shiftDate(d,1)){
    const log=days[d]?.logs[habit.id];if(isPlanned(habit,d)){result.planned++;if(log)result[log.status]++;else result.unknown++;}else if(log&&(log.status==='done'||log.status==='minimum'))result.extra++;
  }
  return result;
}
export function reviseSchedule(habit:Habit,from:string,days:number[]):Habit['schedules']{
  const prior=habit.schedules.filter(s=>s.from<from);
  return [...prior,{from,days:[...days].sort((a,b)=>a-b)}];
}
