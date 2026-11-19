import {destroySticker} from './sticker-effects'
import {StickyBoard, PaperPalette, paperDragType, notePosition, paperColors, surfaces, type Point} from './sticky-board'
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
  const [searchOpen,setSearchOpen]=useState(false)
  const searchToggle=useRef<HTMLButtonElement>(null)
  const [confirmDestroy,setConfirmDestroy]=useState(false)
  const [draft,setDraft]=useState<Task|null>(null),[over,setOver]=useState(-1)
  const [now,setNow]=useState(Date.now()),[notify,setNotify]=useState(false)
  const [menu,setMenu]=useState<{task:Task,anchor:HTMLElement}|null>(null)
  const panel=useRef<HTMLDivElement>(null), busy=useRef(false)
  function closeMenu(){
    setMenu(null);setDraft(null);setConfirmDestroy(false)
  }
  useEffect(()=>{
    if(!menu)return
    function outside(event:PointerEvent){
      if(panel.current?.contains(event.target as Node))return
      closeMenu()
    }
    function escape(event:KeyboardEvent){
      if(event.key!=='Escape')return
      closeMenu()
      menu?.anchor.focus()
    }
    const scroll=()=>closeMenu()
    document.addEventListener('pointerdown',outside)
    document.addEventListener('keydown',escape)
    window.addEventListener('resize',scroll)
    window.addEventListener('scroll',scroll)
    return ()=>{
      document.removeEventListener('pointerdown',outside)
      document.removeEventListener('keydown',escape)
      window.removeEventListener('resize',scroll)
      window.removeEventListener('scroll',scroll)
    }
  },[menu])
  const anchor=menu?.anchor.getBoundingClientRect()
  const panelWidth=Math.min(340,window.innerWidth-24)
  const beside=anchor&&(anchor.right+panelWidth+20<=window.innerWidth?anchor.right+8:anchor.left-panelWidth-8)
  const panelLeft=Math.max(12,Math.min(beside??12,window.innerWidth-panelWidth-12))
  const panelTop=anchor?Math.max(12,Math.min(anchor.top,window.innerHeight-(draft?260:145))):12
  const actionsLeft=Math.max(65,Math.min(anchor?.right??65,window.innerWidth-65))
  const actionsTop=Math.max(72,anchor?.top??72)
  const preferencesQueue=useRef(Promise.resolve())
  const today=view==='Сегодня', boardView=view==='Доска'
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
      setSurface(options?.surface==='Пробка'?'Облако':surfaces.includes(options?.surface)?options.surface:surfaces[0])
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
  async function removeSticker(id:string){
    const card=Array.from(document.querySelectorAll<HTMLElement>('[data-sticker-id]')).find(sticker=>sticker.dataset.stickerId===id)
    const bounds=card?.getBoundingClientRect()
    const color=card&&getComputedStyle(card).getPropertyValue('--paper').trim()
    const background=card&&getComputedStyle(card).backgroundColor
    const title=card?.querySelector('strong')?.textContent
    if(!await save(tasks.filter(task=>task.id!==id)))return
    closeMenu()
    if(bounds&&background)destroySticker(bounds,color||background,title)
  }
  function openStickerMenu(task:Task,anchor:HTMLElement){
    setDraft(null);setConfirmDestroy(false);setMenu({task,anchor})
  }
  function add(stage=0,position?:Point,paper=paperColors[tasks.length%paperColors.length] as string){
    void save([...tasks,{id:crypto.randomUUID(),title:'',note:'',area:filter==='Личное'?filter:'Работа',due:'',stage,position,paper}])
  }
  function move(id:string,position:Point){
    void save(tasks.map(task=>task.id===id?{...task,position}:task))
  }
  function field<K extends keyof Task>(k:K,v:Task[K]){if(draft)setDraft({...draft,[k]:v})}
  const columns=boardColumns(tasks,today,filter,query,now)
  const overdue=(t:Task)=>!!t.due&&t.stage!==2&&Date.parse(t.due)<=now
  function card(t:Task){return <button className={'card paper-'+paperColors.findIndex(color=>color===t.paper)} key={t.id} data-sticker-id={t.id} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',t.id)} onDragEnd={()=>setOver(-1)} onDoubleClick={e=>openStickerMenu(t,e.currentTarget)} onContextMenu={e=>{e.preventDefault();openStickerMenu(t,e.currentTarget)}} onClick={e=>{if(e.detail===0)openStickerMenu(t,e.currentTarget)}}><small>{t.area}</small><strong>{t.title||'Пустой стикер'}</strong><span className="tags">{Array.from(new Set((t.tags||'').split(',').map(x=>x.trim()).filter(Boolean))).map(tag=><span key={tag} style={{background:['#e7dcff','#ffddb9','#cbe9df'][tag.length%3]}}>{tag}</span>)}</span>{!!t.steps?.length&&<small>✓ {t.steps.filter(step=>step.done).length} / {t.steps.length}</small>}{t.due&&<small>{overdue(t)?'Пора · ':'◷ '}{new Date(t.due).toLocaleString('ru',{dateStyle:'short',timeStyle:'short'})}</small>}</button>}
  return <><header className={boardView?'board-header':undefined}>
    <b className="logo"><span className="mark" aria-hidden="true">✦</span>пингборд</b>
    <div className="switch">{views.map(label=><button key={label} className={view===label?'active':''} aria-pressed={view===label} disabled={!ready} onClick={()=>preferences(label,filter)}>{label}</button>)}</div>
    {boardView&&<button type="button" ref={searchToggle} className="board-search-toggle" aria-label="Поиск и фильтры" aria-expanded={searchOpen} aria-controls="board-search" data-filtered={!!query||filter!=='Все'} onClick={()=>setSearchOpen(!searchOpen)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></svg>
    </button>}
  </header>
  {!boardView&&<><h1>{view}<span style={{color:'#9069db'}}>.</span></h1><p>{new Date(now).toLocaleDateString('ru',{weekday:'long',day:'numeric',month:'long'})} · Активных задач: {tasks.filter(t=>t.stage!==2).length}</p></>}
  <nav id={boardView?'board-search':undefined} className={boardView?'board-search':undefined} hidden={boardView&&!searchOpen} aria-label="Поиск и фильтры"
    onKeyDown={event=>{
      if(!boardView||event.key!=='Escape')return
      event.stopPropagation()
      setSearchOpen(false)
      searchToggle.current?.focus()
    }}>
    <input key={boardView?String(searchOpen):'list'} autoFocus={boardView&&searchOpen} aria-label="Поиск задач" placeholder="Поиск задач" value={query} onChange={e=>setQuery(e.target.value)}/>
    {['Все','Работа','Личное'].map(s=><button key={s} className={filter===s?'active':''} aria-pressed={filter===s} disabled={!ready} onClick={()=>preferences(view,s)}>{s}</button>)}
    {view==='Канбан'&&<PaperPalette disabled={!ready} add={paper=>add(0,undefined,paper)}/>}
    {!native&&'Notification' in window&&Notification.permission==='default'&&<button onClick={async()=>{await Notification.requestPermission();setNotify(!notify)}}>Включить уведомления</button>}
  </nav><output>{error}</output>{!today&&tasks.some(overdue)&&<p className={boardView?'board-overdue':undefined}><button onClick={()=>preferences('Сегодня',filter)}>Пора заняться · {tasks.filter(overdue).length} →</button></p>}
  {view==='Доска'?ready&&<StickyBoard notes={tasks} visible={new Set(columns.flat().map(task=>task.id))} surface={surface}
    customize={background=>preferences(view,filter,background)} add={(position,paper)=>add(0,position,paper)} edit={openStickerMenu} move={move}/>:<div id="board">{(today?['Пора заняться','Сегодня до конца дня','Ближайшее']:stages).map((s,i)=>{
    const group=columns[i]
    return <section key={s} className={over===i?'over':''} onDragOver={e=>{if(!today){e.preventDefault();setOver(i)}}} onDrop={e=>{e.preventDefault();setOver(-1);if(today)return;const paper=e.dataTransfer.getData(paperDragType);if(paperColors.some(color=>color===paper)){add(i,undefined,paper);return}const id=e.dataTransfer.getData('text/plain');if(tasks.some(t=>t.id===id&&t.stage!==i))void save(tasks.map(t=>t.id===id?{...t,stage:i}:t))}}><h2>{s}<small>{group.length}</small></h2>{group.map(card)}{today&&!group.length&&<small>Задач нет</small>}{!today&&<button className="add" disabled={!ready} onClick={()=>add(i)}>+ Стикер</button>}</section>
  })}</div>}{menu&&!draft&&!confirmDestroy&&<div ref={panel} className="sticker-actions" role="group" aria-label="Действия со стикером" style={{left:actionsLeft,top:actionsTop}}>
    <button type="button" autoFocus aria-label="Изменить" title="Изменить" onClick={()=>setDraft({...menu.task})}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/></svg>
    </button>
    <button type="button" className="destroy-button" aria-label="Уничтожить" title="Уничтожить" onClick={()=>setConfirmDestroy(true)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v6m4-6v6"/></svg>
    </button>
  </div>}{menu&&(draft||confirmDestroy)&&<div ref={panel} className="sticker-panel" role="dialog" aria-label="Меню стикера"
    style={{left:panelLeft,top:panelTop,width:panelWidth,maxHeight:Math.max(100,window.innerHeight-panelTop-12)}}>
    {confirmDestroy?<div className="destroy-confirm">
      <p role="status">Уничтожить стикер? Его нельзя будет восстановить.</p>
      <output>{error}</output>
      <div className="row">
        <button type="button" autoFocus onClick={()=>setConfirmDestroy(false)}>Оставить</button>
        <button type="button" className="destroy-button" onClick={()=>void removeSticker(menu.task.id)}>Да, уничтожить</button>
      </div>
    </div>:draft&&<form onSubmit={async e=>{e.preventDefault();if(confirmDestroy)return;const title=draft.title.trim();if(!title)return;const old=tasks.find(t=>t.id===draft.id);const t={...draft,title,steps:draft.steps?.filter(step=>step.text.trim()),position:draft.position??notePosition(old?tasks.indexOf(old):tasks.length),pinged:old?.due===draft.due&&old?.pinged};if(await save(old?tasks.map(a=>a.id===t.id?t:a):[...tasks,t]))closeMenu()}}><h2>{draft.title?'Стикер':'Заполни стикер'}</h2><label>Задача<input autoFocus required maxLength={200} value={draft.title} onChange={e=>field('title',e.target.value)}/></label><details className="note-details"><summary>Детали</summary><label>Заметка<textarea value={draft.note} onChange={e=>field('note',e.target.value)}/></label><label>Метки через запятую<input value={draft.tags||''} onChange={e=>field('tags',e.target.value)}/></label>
  <label>Цвет стикера<select value={draft.paper??paperColors[Math.max(0,tasks.findIndex(task=>task.id===draft.id))%paperColors.length]} onChange={e=>field('paper',e.target.value)}>{paperColors.map(color=><option key={color}>{color}</option>)}</select></label>
  <fieldset><legend>Чек-лист</legend>{draft.steps?.map(step=><div className="step" key={step.id}>
    <input type="checkbox" aria-label={'Выполнено: '+step.text} checked={step.done} onChange={()=>field('steps',draft.steps?.map(item=>item.id===step.id?{...item,done:!item.done}:item))}/>
    <input aria-label="Название шага" value={step.text} onChange={e=>field('steps',draft.steps?.map(item=>item.id===step.id?{...item,text:e.target.value}:item))}/>
    <button type="button" aria-label={'Удалить шаг '+step.text} onClick={()=>field('steps',draft.steps?.filter(item=>item.id!==step.id))}>×</button></div>)}
    <button type="button" onClick={()=>field('steps',[...(draft.steps||[]),{id:crypto.randomUUID(),text:'',done:false}])}>+ Шаг</button></fieldset>
  <label>Сфера<select value={draft.area} onChange={e=>field('area',e.target.value)}><option>Работа</option><option>Личное</option></select></label><label>Статус<select value={draft.stage} onChange={e=>field('stage',+e.target.value)}>{stages.map((s,i)=><option value={i} key={s}>{s}</option>)}</select></label><label>Напомнить в<input type="datetime-local" value={draft.due} onChange={e=>field('due',e.target.value)}/></label></details><output>{error}</output><div className="row"><button type="button" onClick={closeMenu}>Отмена</button><button className="primary">Сохранить</button></div></form>}</div>}</>
}
createRoot(document.getElementById('root')!).render(<App/>)
