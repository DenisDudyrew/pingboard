type Card = {title:string, note?:string, tags?:string, area:string, due:string, stage:number}

export function boardColumns<T extends Card>(tasks:T[], today:boolean, area:string, query:string, now:number):T[][] {
  const visible=tasks.filter(task =>
    (area==='Все'||task.area===area) &&
    [task.title,task.note,task.tags].join(' ').toLowerCase().includes(query.toLowerCase())
  ).sort((a,b)=>(a.due||'z').localeCompare(b.due||'z'))
  if(!today)return [0,1,2].map(stage=>visible.filter(task=>task.stage===stage))
  const tomorrow=new Date(now)
  tomorrow.setHours(24,0,0,0)
  const pending=visible.filter(task=>task.stage!==2 && task.due)
  return [
    pending.filter(task=>Date.parse(task.due)<=now),
    pending.filter(task=>Date.parse(task.due)>now && Date.parse(task.due)<+tomorrow),
    pending.filter(task=>Date.parse(task.due)>=+tomorrow).slice(0,1),
  ]
}
