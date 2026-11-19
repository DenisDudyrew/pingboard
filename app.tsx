import {StickyBoard, notePosition, paperColors, surfaces, type Point} from './sticky-board'
import {boardColumns} from './board-view'
import {reminderChanges} from './reminders'
import {useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'

type Task={id:string,title:string,note:string,due:string,area:string,stage:number,paper?:string,position?:Point,pinged?:boolean,tags?:string,steps?:{id:string,text:string,done:boolean}[]}
const views=['Доска','Канбан','Сегодня'] as const
type View=typeof views[number]
const stages=['В планах','В работе','Готово']
const key='pingboard.tasks'
type Bridge={invoke:(name:string,args?:Record<string,unknown>)=>Promise<string>}
const native=(window as Window & {__TAURI__?:{core:Bridge}}).__TAURI__?.core
function App(){
  const [tasks,setTasks]=useState<Task[]>([])
  const [ready,setReady]=useState(false),[error,setError]=useState('')
  const [view,setView]=useState<View>('Доска'),[surface,setSurface]=useState<string>(surfaces[0]),[filter,setFilter]=useState('Все'),[query,setQuery]=useState('')
  const [draft,setDraft]=useState<Task|null>(null),[over,setOver]=useState(-1)
  const [now,setNow]=useState(Date.now()),[notify,setNotify]=useState(false)
  const dialog=useRef<HTMLDialogElement>(null), busy=useRef(false)
  const preferencesQueue=useRef(Promise.resolve())
  const today=view==='Сегодня'
  function preferences(nextView:View,area:string,background=surface){
    setView(nextView);setFilter(area);setSurface(background)
    const data=JSON.stringify({view:nextView,today:nextView==='Сегодня',filter:area,surface:background})
    preferencesQueue.current=preferencesQueue.current.then(async()=>{
      if(native)await native.invoke('save_settings',{data})
      else localStorage.setItem('pingboard.settings',data)
    }).catch(e=>setError('Ошибка сохранения настроек: '+e))
  }
  useEffect(()=>{
    async function load(){
      try{setTasks(JSON.parse(native?await native.invoke('load_tasks'):localStorage.getItem(key)||'[]'));setReady(true)}
      catch(e){setError('Ошибка чтения задач: '+e)}
    }
    async function loadPreferences(){
      const raw=native?await native.invoke('load_settings'):localStorage.getItem('pingboard.settings')
      const options=JSON.parse(raw||'{}')
      setView(views.includes(options?.view)?options.view:options?.today===true?'Сегодня':'Доска')
      setSurface(surfaces.includes(options?.surface)?options.surface:surfaces[0])
      setFilter(['Работа','Личное'].includes(options?.filter)?options.filter:'Все')
    }
    loadPreferences().catch(e=>setError('Ошибка чтения настроек: '+e)).finally(load)
    const timer=setInterval(()=>setNow(Date.now()),15000)
    const sync=(e:StorageEvent)=>{if(e.key===key)load()}
    window.addEventListener('storage',sync)
    return ()=>{clearInterval(timer);window.removeEventListener('storage',sync)}
  },[])
  async function save(next:Task[]){
    if(busy.current||!ready)return false
    busy.current=true
    try{
      const data=JSON.stringify(next)
      if(native)await native.invoke('save_tasks',{data})
      else localStorage.setItem(key,data)
      setTasks(next);setError('')
      if(native){
        try{
          for(const change of reminderChanges(tasks,next)) {
            await native.invoke('reminder',change)
          }
        }catch(e){setError('Задачи сохранены. Ошибка настройки напоминания: '+e)}
      }
      return true
    }catch(e){setError('Ошибка сохранения: '+e);return false}
    finally{busy.current=false}
  }
  useEffect(()=>{
    if(native||!ready||!('Notification' in window)||Notification.permission!=='granted')return
    const due=tasks.filter(t=>!t.pinged&&t.stage!==2&&t.due&&Date.parse(t.due)<=now)
    if(!due.length)return
    try{due.forEach(t=>new Notification('Пингборд',{body:t.title}));void save(tasks.map(t=>due.includes(t)?{...t,pinged:true}:t))}
    catch{setError('Системные уведомления недоступны')}
  },[tasks,now,notify])
  function edit(t:Task){setDraft({...t});dialog.current?.showModal()}
  function add(stage=0,position?:Point){edit({id:crypto.randomUUID(),title:'',note:'',area:filter==='Личное'?filter:'Работа',due:'',stage,position,paper:paperColors[tasks.length%paperColors.length]})}
  function move(id:string,position:Point){
    void save(tasks.map(task=>task.id===id?{...task,position}:task))
  }
  function field<K extends keyof Task>(k:K,v:Task[K]){if(draft)setDraft({...draft,[k]:v})}
  const columns=boardColumns(tasks,today,filter,query,now)
  const overdue=(t:Task)=>!!t.due&&t.stage!==2&&Date.parse(t.due)<=now
  function card(t:Task){return <button className="card" key={t.id} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',t.id)} onDragEnd={()=>setOver(-1)} onClick={()=>edit(t)}><small>{t.area}</small><strong>{t.title}</strong><span className="tags">{Array.from(new Set((t.tags||'').split(',').map(x=>x.trim()).filter(Boolean))).map(tag=><span key={tag} style={{background:['#e7dcff','#ffddb9','#cbe9df'][tag.length%3]}}>{tag}</span>)}</span>{!!t.steps?.length&&<small>✓ {t.steps.filter(step=>step.done).length} / {t.steps.length}</small>}{t.due&&<small>{overdue(t)?'Пора · ':'◷ '}{new Date(t.due).toLocaleString('ru',{dateStyle:'short',timeStyle:'short'})}</small>}</button>}
  return <><header><b className="logo"><span className="mark">↗</span>пингборд</b><div className="switch">{views.map(label=><button key={label} className={view===label?'active':''} aria-pressed={view===label} disabled={!ready} onClick={()=>preferences(label,filter)}>{label}</button>)}</div></header><h1>{view==='Доска'?'Моя доска':view}<span style={{color:'#9069db'}}>.</span></h1><p>{new Date(now).toLocaleDateString('ru',{weekday:'long',day:'numeric',month:'long'})} · Активных задач: {tasks.filter(t=>t.stage!==2).length}</p><nav>{['Все','Работа','Личное'].map(s=><button key={s} className={filter===s?'active':''} disabled={!ready} onClick={()=>preferences(view,s)}>{s}</button>)}<input aria-label="Поиск задач" placeholder="Поиск задач" value={query} onChange={e=>setQuery(e.target.value)}/>{view!=='Доска'&&<button className="primary" disabled={!ready} onClick={()=>add()}>+ Новая задача</button>}{!native&&'Notification' in window&&Notification.permission==='default'&&<button onClick={async()=>{await Notification.requestPermission();setNotify(!notify)}}>Включить уведомления</button>}</nav><output>{error}</output>{!today&&tasks.some(overdue)&&<p><button onClick={()=>preferences('Сегодня',filter)}>Пора заняться · {tasks.filter(overdue).length} →</button></p>}
  {view==='Доска'?ready&&<StickyBoard notes={tasks} visible={new Set(columns.flat().map(task=>task.id))} surface={surface}
    customize={background=>preferences(view,filter,background)} add={position=>add(0,position)} edit={edit} move={move}/>:<div id="board">{(today?['Пора заняться','Сегодня до конца дня','Ближайшее']:stages).map((s,i)=>{
    const group=columns[i]
    return <section key={s} className={over===i?'over':''} onDragOver={e=>{if(!today){e.preventDefault();setOver(i)}}} onDrop={e=>{e.preventDefault();setOver(-1);const id=e.dataTransfer.getData('text/plain');if(!today&&tasks.some(t=>t.id===id))void save(tasks.map(t=>t.id===id?{...t,stage:i}:t))}}><h2>{s}<small>{group.length}</small></h2>{group.map(card)}{today&&!group.length&&<small>Задач нет</small>}{!today&&<button className="add" disabled={!ready} onClick={()=>add(i)}>+ Добавить</button>}</section>
  })}</div>}<dialog ref={dialog} onClose={()=>setDraft(null)}>{draft&&<form onSubmit={async e=>{e.preventDefault();const title=draft.title.trim();if(!title)return;const old=tasks.find(t=>t.id===draft.id);const t={...draft,title,position:draft.position??notePosition(old?tasks.indexOf(old):tasks.length),pinged:old?.due===draft.due&&old?.pinged};if(await save(old?tasks.map(a=>a.id===t.id?t:a):[...tasks,t]))dialog.current?.close()}}><h2>{tasks.some(t=>t.id===draft.id)?'Редактировать задачу':'Новая задача'}</h2><label>Задача<input autoFocus required maxLength={200} value={draft.title} onChange={e=>field('title',e.target.value)}/></label><label>Заметка<textarea value={draft.note} onChange={e=>field('note',e.target.value)}/></label><label>Метки через запятую<input value={draft.tags||''} onChange={e=>field('tags',e.target.value)}/></label>
  <label>Цвет стикера<select value={draft.paper??paperColors[Math.max(0,tasks.findIndex(task=>task.id===draft.id))%paperColors.length]} onChange={e=>field('paper',e.target.value)}>{paperColors.map(color=><option key={color}>{color}</option>)}</select></label>
  <fieldset><legend>Чек-лист</legend>{draft.steps?.map(step=><div className="step" key={step.id}>
    <input type="checkbox" aria-label={'Выполнено: '+step.text} checked={step.done} onChange={()=>field('steps',draft.steps?.map(item=>item.id===step.id?{...item,done:!item.done}:item))}/>
    <input required aria-label="Название шага" value={step.text} onChange={e=>field('steps',draft.steps?.map(item=>item.id===step.id?{...item,text:e.target.value}:item))}/>
    <button type="button" aria-label={'Удалить шаг '+step.text} onClick={()=>field('steps',draft.steps?.filter(item=>item.id!==step.id))}>×</button></div>)}
    <button type="button" onClick={()=>field('steps',[...(draft.steps||[]),{id:crypto.randomUUID(),text:'',done:false}])}>+ Шаг</button></fieldset>
  <label>Сфера<select value={draft.area} onChange={e=>field('area',e.target.value)}><option>Работа</option><option>Личное</option></select></label><label>Статус<select value={draft.stage} onChange={e=>field('stage',+e.target.value)}>{stages.map((s,i)=><option value={i} key={s}>{s}</option>)}</select></label><label>Напомнить в<input type="datetime-local" value={draft.due} onChange={e=>field('due',e.target.value)}/></label><output>{error}</output><div className="row"><button className="primary">Сохранить</button><button type="button" onClick={()=>dialog.current?.close()}>Отмена</button>{tasks.some(t=>t.id===draft.id)&&<button type="button" onClick={async()=>{if(confirm('Удалить задачу?')&&await save(tasks.filter(t=>t.id!==draft.id)))dialog.current?.close()}}>Удалить</button>}</div></form>}</dialog></>
}
createRoot(document.getElementById('root')!).render(<App/>)
