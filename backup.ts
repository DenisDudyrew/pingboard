import {paperColors,pinColors,surfaces,type PinColor,type Point} from './sticky-board'

export type Task={id:string,title:string,note:string,due:string,area:string,stage:number,paper?:string,pinColor?:PinColor,position?:Point,pinged?:boolean,tags?:string,steps?:{id:string,text:string,done:boolean}[]}
export type BackupSettings={view:'Доска'|'Канбан'|'Сегодня',filter:string,surface:string,camera:Point & {zoom:number}}
type Backup={version:1,tasks:Task[],settings:BackupSettings}

function object(value:unknown):value is Record<string,unknown>{
  return typeof value==='object'&&value!==null&&!Array.isArray(value)
}
function point(value:unknown):value is Point{
  return object(value)&&Number.isFinite(value.x)&&Number.isFinite(value.y)
}
function member(value:unknown,choices:readonly string[]){
  return typeof value==='string'&&choices.includes(value)
}
function validTask(value:unknown):value is Task{
  if(!object(value))return false
  const {id,title,note,due,area,stage,paper,pinColor,position,pinged,tags,steps}=value
  return typeof id==='string'&&id.length>0&&!id.includes('\0')&&typeof title==='string'&&!title.includes('\0')&&
    typeof note==='string'&&typeof due==='string'&&(!due||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(due)&&Number.isFinite(Date.parse(due))))&&
    member(area,['Работа','Личное'])&&(stage===0||stage===1||stage===2)&&
    (paper===undefined||member(paper,paperColors))&&(pinColor===undefined||member(pinColor,pinColors))&&
    (position===undefined||point(position))&&(pinged===undefined||typeof pinged==='boolean')&&
    (tags===undefined||typeof tags==='string')&&
    (steps===undefined||(Array.isArray(steps)&&steps.every(step=>object(step)&&typeof step.id==='string'&&
      typeof step.text==='string'&&typeof step.done==='boolean')&&new Set(steps.map(step=>step.id)).size===steps.length))
}
export function readBackup(raw:string):Backup{
  const value:unknown=JSON.parse(raw)
  if(object(value)&&value.version===1&&Array.isArray(value.tasks)&&value.tasks.every(validTask)&&
    new Set(value.tasks.map(task=>task.id)).size===value.tasks.length&&object(value.settings)){
    const {view,filter,surface,camera}=value.settings
    if((view==='Доска'||view==='Канбан'||view==='Сегодня')&&typeof filter==='string'&&member(filter,['Все','Работа','Личное'])&&
      typeof surface==='string'&&member(surface,surfaces)&&object(camera)&&typeof camera.zoom==='number'&&
      camera.zoom>=0.5&&camera.zoom<=1.5){
      const zoom=camera.zoom
      if(point(camera))return {version:1,tasks:value.tasks,settings:{view,filter,surface,camera:{...camera,zoom}}}
    }
  }
  throw Error('Файл не похож на резервную копию Пингборда')
}
