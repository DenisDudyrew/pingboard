import {readZones,zoneAt,zoneColors,zoneSize,type Zone} from './board-zones'
import {destroySticker,celebrate} from './sticker-effects'
import {StickyBoard, PaperPalette, paperDragType, notePosition, paperColors, surfaces, pinColors, defaultPinColor, type PinColor, type Point} from './sticky-board'
import {boardColumns} from './board-view'
import {reminderChanges} from './reminders'
import {readBackup,type Task,type BackupSettings} from './backup'
import {useEffect,useEffectEvent,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'

const views=['Доска','Канбан','Сегодня'] as const
type View=typeof views[number]
const stages=['В планах','В работе','Готово']
const key='pingboard.tasks'
type Bridge={invoke:(name:string,args?:Record<string,unknown>)=>Promise<string>}
const native=(window as Window & {__TAURI__?:{core:Bridge}}).__TAURI__?.core
function App(){
  const [tasks,setTasks]=useState<Task[]>([])
  const latestTasks=useRef<Task[]>([])
  const [zones,setZones]=useState<Zone[]>([])
  const latestZones=useRef<Zone[]>([])
  const [zoneDraft,setZoneDraft]=useState<Zone|null>(null)
  const [zoneSaving,setZoneSaving]=useState(false)
  const [leavingZones,setLeavingZones]=useState<Zone[]>([])
  const zoneDialog=useRef<HTMLDialogElement>(null)
  const zoneReturnFocus=useRef<HTMLElement|null>(null)
  const zoneAnimatingTimers=useRef<ReturnType<typeof setTimeout>[]>([])
  const taskQueue=useRef(Promise.resolve())
  type Reminder=ReturnType<typeof reminderChanges>[number]
  const pendingReminders=useRef<Reminder[]>([])
  const sendingReminders=useRef(false)
  const [reminderError,setReminderError]=useState(false)
  const remindersLoaded=useRef(false)
  const [backupStatus,setBackupStatus]=useState('')
  const [importing,setImporting]=useState(false)
  const importInProgress=useRef(false)
  const importFile=useRef<HTMLInputElement>(null)
  const [cameraVersion,setCameraVersion]=useState(0)
  const [located,setLocated]=useState<{id:string}|null>(null)
  const [,setWindowSize]=useState(0)
  const [ready,setReady]=useState(false),[error,setError]=useState('')
  const [view,setView]=useState<View>('Доска'),[surface,setSurface]=useState<string>(surfaces[0]),[filter,setFilter]=useState('Все'),[query,setQuery]=useState('')
  const [searchOpen,setSearchOpen]=useState(false)
  const searchToggle=useRef<HTMLButtonElement>(null)
  const camera=useRef({x:0,y:0,zoom:1})
  const [deleted,setDeleted]=useState<{task:Task,index:number,cancelEffect?:()=>void}[]>([])
  const lastDeleted=deleted[deleted.length-1]
  useEffect(()=>{
    if(!lastDeleted)return
    const timer=setTimeout(()=>setDeleted(items=>items.filter(item=>item!==lastDeleted)),8000)
    return ()=>clearTimeout(timer)
  },[lastDeleted])
  const [detailsOpen,setDetailsOpen]=useState(false)
  const editor=useRef<HTMLFormElement>(null)
  const editorRevision=useRef(0)
  const [draft,setDraft]=useState<Task|null>(null),[over,setOver]=useState(-1)
  const isEditing=draft!==null
  const [now,setNow]=useState(Date.now()),[notify,setNotify]=useState(false)
  const [menu,setMenu]=useState<{task:Task,anchor:HTMLElement,bounds:DOMRect}|null>(null)
  const panel=useRef<HTMLDivElement>(null)
  const dirty=!!draft&&JSON.stringify(draft)!==JSON.stringify(menu?.task)
  function closeMenu(){
    editorRevision.current++
    setMenu(null);setDraft(null);setDetailsOpen(false)
  }
  function discardDraft(){
    return !dirty||window.confirm('Закрыть стикер и отменить несохранённые изменения? Чтобы сохранить черновик, вернитесь к редактору и нажмите галочку.')
  }
  function requestClose(){
    if(discardDraft())closeMenu()
  }
  useEffect(()=>{
    if(!menu)return
    function outside(event:PointerEvent){
      if(isEditing)return
      const target=event.target as Node
      if(panel.current?.contains(target)||editor.current?.contains(target)|| (target instanceof Element && target.closest<HTMLElement>('[data-sticker-id]')?.dataset.stickerId===menu?.task.id))return
      closeMenu()
    }
    function escape(event:KeyboardEvent){
      if(event.key!=='Escape')return
      if(!discardDraft())return
      closeMenu()
      menu?.anchor.focus()
    }
    function scroll(){
      if(!isEditing)closeMenu()
    }
    document.addEventListener('pointerdown',outside,true)
    document.addEventListener('keydown',escape)
    const resize=()=>setWindowSize(size=>size+1)
    window.addEventListener('resize',resize)
    window.addEventListener('scroll',scroll)
    return ()=>{
      document.removeEventListener('pointerdown',outside,true)
      document.removeEventListener('keydown',escape)
      window.removeEventListener('resize',resize)
      window.removeEventListener('scroll',scroll)
    }
  },[menu,isEditing,dirty])
  const anchor=menu?.anchor.isConnected?menu.anchor.getBoundingClientRect():menu?.bounds
  const panelWidth=Math.min(340,window.innerWidth-24)
  const beside=anchor&&(anchor.right+panelWidth+20<=window.innerWidth?anchor.right+8:anchor.left-panelWidth-8)
  const panelLeft=Math.max(12,Math.min(beside??12,window.innerWidth-panelWidth-12))
  const panelTop=anchor?Math.max(12,Math.min(anchor.top,window.innerHeight-(draft?260:145))):12
  const actionsLeft=Math.max(65,Math.min(anchor?.right??65,window.innerWidth-65))
  const actionsTop=Math.max(72,anchor?.top??72)
  const cameraSaveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
  const today=view==='Сегодня', boardView=view==='Доска'
  const currentPreferences=useRef<Pick<BackupSettings,'view'|'filter'|'surface'>>({view,filter,surface})
  function settingsSnapshot(zones=latestZones.current):BackupSettings{
    return {...currentPreferences.current,camera:camera.current,...(zones.length?{zones}:{})}
  }
  function applyZones(next:Zone[]){
    latestZones.current=next
    setZones(next)
  }
  function preferences(nextView:View,area:string,background=surface){
    if(importInProgress.current)return
    clearTimeout(cameraSaveTimer.current)
    if(nextView!==view)setLocated(null)
    setView(nextView);setFilter(area);setSurface(background)
    currentPreferences.current={view:nextView,filter:area,surface:background}
    taskQueue.current=taskQueue.current.then(async()=>{
      const data=JSON.stringify({...settingsSnapshot(),today:currentPreferences.current.view==='Сегодня'})
      if(native)await native.invoke('save_settings',{data})
      else localStorage.setItem('pingboard.settings',data)
    }).catch(e=>setError('Ошибка сохранения настроек: '+e))
  }
  function rememberCamera(state:{x:number,y:number,zoom:number},fromGesture=false){
    camera.current=state
    if(!fromGesture){
      preferences(view,filter)
      return
    }
    if(menu)closeMenu()
    clearTimeout(cameraSaveTimer.current)
    cameraSaveTimer.current=setTimeout(()=>preferences(view,filter),150)
  }
  useEffect(()=>{
    async function load(){
      try{
        const loaded:Task[]=JSON.parse(native?await native.invoke('load_tasks'):localStorage.getItem(key)||'[]')
        latestTasks.current=loaded
        setTasks(loaded)
        setReady(true)
      }
      catch(e){setError('Ошибка чтения задач: '+e)}
    }
    async function loadPreferences(){
      const raw=native?await native.invoke('load_settings'):localStorage.getItem('pingboard.settings')
      const options=JSON.parse(raw||'{}')
      const saved=options?.camera
      if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)&&saved.zoom>=0.5&&saved.zoom<=1.5&&Number.isFinite(saved.zoom))camera.current=saved
      const loadedView=views.includes(options?.view)?options.view:options?.today===true?'Сегодня':'Доска'
      const loadedSurface=options?.surface==='Пробка'?'Облако':surfaces.includes(options?.surface)?options.surface:surfaces[0]
      const loadedFilter=['Работа','Личное'].includes(options?.filter)?options.filter:'Все'
      currentPreferences.current={view:loadedView,filter:loadedFilter,surface:loadedSurface}
      setView(loadedView)
      setSurface(loadedSurface)
      setFilter(loadedFilter)
      applyZones(readZones(options?.zones)??[])
    }
    async function initialize(){
      if(native)void flushReminders()
      await loadPreferences().catch(e=>setError('Ошибка чтения настроек: '+e))
      await load()
    }
    void initialize()
    const timer=setInterval(()=>setNow(Date.now()),15000)
    const sync=(e:StorageEvent)=>{if(e.key===key)load()}
    window.addEventListener('storage',sync)
    return ()=>{clearInterval(timer);window.removeEventListener('storage',sync)}
  },[])
  async function flushReminders(){
    if(!native||sendingReminders.current)return
    sendingReminders.current=true
    setReminderError(false)
    try{
      if(!remindersLoaded.current){
        const stored:Reminder[]=JSON.parse(await native.invoke('load_pending_reminders'))
        const present=new Set(pendingReminders.current.map(item=>item.id))
        pendingReminders.current=[...stored.filter(item=>!present.has(item.id)),...pendingReminders.current]
        remindersLoaded.current=true
      }
      const attempted=new Set<Reminder>()
      for(let reminder=pendingReminders.current.find(item=>!attempted.has(item));reminder;reminder=pendingReminders.current.find(item=>!attempted.has(item))){
        attempted.add(reminder)
        try{
          await native.invoke('reminder',reminder)
          await native.invoke('ack_reminder',reminder)
          pendingReminders.current=pendingReminders.current.filter(item=>item!==reminder)
        }catch{setReminderError(true)}
      }
    }catch{setReminderError(true)}
    finally{sendingReminders.current=false}
  }
  function save(update:(current:Task[])=>Task[],settings?:BackupSettings|(()=>BackupSettings),beforeImport?:(current:Task[])=>Promise<void>){
    if(!ready||(importInProgress.current&&!settings))return Promise.resolve(false)
    const operation=taskQueue.current.then(async()=>{
      const previous=latestTasks.current
      try{
        const next=update(previous)
        if(next===previous&&!settings)return false
        if(beforeImport){
          clearTimeout(cameraSaveTimer.current)
          await beforeImport(previous)
        }
        const nextSettings=typeof settings==='function'?settings():settings
        const data=JSON.stringify(next)
        if(native){
          const reminders=reminderChanges(previous,next)
          await native.invoke('save_tasks',{data,reminders,settings:nextSettings?JSON.stringify(nextSettings):null})
          const replaced=new Set(reminders.map(item=>item.id))
          pendingReminders.current=[...pendingReminders.current.filter(item=>!replaced.has(item.id)),...reminders]
          void flushReminders()
        }else{
          const settingsKey='pingboard.settings'
          const previousSettings=nextSettings?localStorage.getItem(settingsKey):null
          if(nextSettings)localStorage.setItem(settingsKey,JSON.stringify(nextSettings))
          try{localStorage.setItem(key,data)}
          catch(e){
            if(nextSettings){
              if(previousSettings===null)localStorage.removeItem(settingsKey)
              else localStorage.setItem(settingsKey,previousSettings)
            }
            throw e
          }
        }
        if(nextSettings)applyZones(nextSettings.zones??[])
        if(beforeImport&&nextSettings){
          const {view,filter,surface,camera:point}=nextSettings
          currentPreferences.current={view,filter,surface}
          camera.current=point
        }
        latestTasks.current=next
        setTasks(next)
        setError('')
        return true
      }catch(e){setError('Ошибка сохранения: '+e);return false}
    })
    taskQueue.current=operation.then(()=>{})
    return operation
  }
  useEffect(()=>{
    if(native||!ready||!('Notification' in window)||Notification.permission!=='granted')return
    const due=tasks.filter(t=>!t.pinged&&t.stage!==2&&t.due&&Date.parse(t.due)<=now)
    if(!due.length)return
    try{due.forEach(t=>new Notification('Пингборд',{body:t.title}));void save(current=>current.map(t=>due.some(item=>item.id===t.id&&item.due===t.due)?{...t,pinged:true}:t))}
    catch{setError('Системные уведомления недоступны')}
  },[tasks,now,notify])
  async function removeSticker(id:string){
    const revision=editorRevision.current
    const card=Array.from(document.querySelectorAll<HTMLElement>('[data-sticker-id]')).find(sticker=>sticker.dataset.stickerId===id)
    const bounds=card?.getBoundingClientRect()
    const color=card&&getComputedStyle(card).getPropertyValue('--paper').trim()
    const background=card&&getComputedStyle(card).backgroundColor
    const title=card?.querySelector('strong')?.textContent
    let removed:{task:Task,index:number}|undefined
    if(!await save(current=>{
      const index=current.findIndex(task=>task.id===id)
      if(index<0)return current
      removed={task:current[index],index}
      return current.filter(task=>task.id!==id)
    })||!removed)return
    if(revision===editorRevision.current)closeMenu()
    const cancelEffect=bounds&&background?destroySticker(bounds,color||background,title):undefined
    const entry={...removed,cancelEffect}
    setDeleted(items=>[...items,entry])
  }
  async function restore(){
    if(!lastDeleted)return
    if(!await save(current=>{
      if(current.some(t=>t.id===lastDeleted.task.id))return current
      const next=[...current]
      next.splice(lastDeleted.index,0,lastDeleted.task)
      return next
    }))return
    lastDeleted.cancelEffect?.()
    setDeleted(items=>items.filter(item=>item!==lastDeleted))
  }
  async function complete(){
    if(!menu)return
    const revision=editorRevision.current
    const rect=menu.anchor.getBoundingClientRect()
    if(await save(current=>current.map(t=>t.id===menu.task.id?{...t,stage:2}:t))){
      if(revision===editorRevision.current)closeMenu()
      celebrate(rect)
    }
  }
  function openStickerMenu(task:Task,anchor:HTMLElement){
    if(importInProgress.current||!discardDraft())return
    editorRevision.current++
    setDraft(null);setDetailsOpen(false);setMenu({task,anchor,bounds:anchor.getBoundingClientRect()})
  }
  async function exportBackup(current:Task[],beforeImport=false){
    const data=JSON.stringify({version:1,tasks:current,settings:settingsSnapshot()},null,2)
    if(native)return native.invoke('write_backup',{data})
    if(beforeImport)localStorage.setItem('pingboard.pre-import-backup',data)
    const url=URL.createObjectURL(new Blob([data],{type:'application/json'}))
    const link=document.createElement('a')
    link.href=url
    link.download='Pingboard-'+new Date().toISOString().slice(0,10)+'.json'
    link.click()
    setTimeout(()=>URL.revokeObjectURL(url),1000)
    return 'в загрузках'
  }
  async function handleExport(){
    try{setBackupStatus('Копия сохранена: '+await exportBackup(latestTasks.current))}
    catch(e){setBackupStatus('Не удалось сохранить копию: '+e)}
  }
  async function handleImport(file:File){
    importInProgress.current=true
    setImporting(true)
    try{
      const backup=readBackup(await file.text())
      if(!window.confirm('Заменить текущие задачи и настройки данными из копии ('+backup.tasks.length+' стикеров)? Перед заменой будет сохранена резервная копия.'))return
      let recovery=''
      if(await save(()=>backup.tasks,backup.settings,async current=>{recovery=await exportBackup(current,true)})){
        const settings=backup.settings
        closeMenu()
        setDeleted([])
        setLocated(null)
        setQuery('')
        setSearchOpen(false)
        camera.current=settings.camera
        setCameraVersion(value=>value+1)
        setView(settings.view)
        setFilter(settings.filter)
        setSurface(settings.surface)
        setBackupStatus('Восстановлено стикеров: '+backup.tasks.length+'. Предыдущая копия сохранена: '+recovery)
      }
    }catch(e){setBackupStatus('Не удалось восстановить копию: '+e)}
    finally{importInProgress.current=false;setImporting(false)}
  }
  const importSelected=useEffectEvent((input:HTMLInputElement)=>{
    const file=input.files?.[0]
    input.value=''
    if(file&&!importInProgress.current&&!isEditing&&!zoneDraft)void handleImport(file)
  })
  useEffect(()=>{
    const input=importFile.current
    if(!input)return
    const change=()=>importSelected(input)
    input.addEventListener('change',change)
    return ()=>input.removeEventListener('change',change)
  },[])
  function add(stage=0,position?:Point,paper?:string,locate=false,avoidOverlap=false){
    const id=crypto.randomUUID()
    const area=filter==='Личное'?'Личное':'Работа'
    void save(current=>{
      let point=position
      if(point&&avoidOverlap){
        const occupied=current.map((task,index)=>task.position??notePosition(index))
        let {x,y}=point
        while(occupied.some(other=>Math.abs(other.x-x)<35&&Math.abs(other.y-y)<35)){
          x+=36
          y+=16
        }
        point={x,y}
      }
      return [...current,{id,title:'',note:'',area,due:'',stage,position:point,paper:paper??paperColors[current.length%paperColors.length]}]
    })
      .then(saved=>{if(saved&&locate){setQuery('');setSearchOpen(false);setLocated({id})}})
  }
  function openZone(zone:Zone){
    if(isEditing||importInProgress.current)return
    closeMenu()
    zoneReturnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null
    setZoneDraft({...zone})
  }
  function createZone(position:Point){
    openZone({...position,...zoneSize,id:crypto.randomUUID(),title:'Новая область',description:'',color:zoneColors[0]})
  }
  function closeZone(){
    setZoneDraft(null)
    zoneDialog.current?.close()
    zoneReturnFocus.current?.focus({preventScroll:true})
  }
  useEffect(()=>{
    const dialog=zoneDialog.current
    if(!zoneDraft||!dialog||dialog.open)return
    dialog.showModal()
    dialog.querySelector('input')?.select()
  },[zoneDraft])
  useEffect(()=>()=>{for(const timer of zoneAnimatingTimers.current)clearTimeout(timer)},[])
  function updateZones(update:(current:Zone[])=>Zone[]){
    return save(current=>current,()=>settingsSnapshot(update(latestZones.current)))
  }
  function moveZone(id:string,position:Point){
    let nextZones:Zone[]
    return save(current=>{
      const previous=latestZones.current
      const zone=previous.find(item=>item.id===id)
      nextZones=previous
      if(!zone)return current
      nextZones=previous.map(item=>item.id===id?{...zone,...position}:item)
      const dx=position.x-zone.x
      const dy=position.y-zone.y
      return current.map((task,index)=>{
        const point=task.position??notePosition(index)
        return zoneAt(previous,point)?.id===id?{...task,position:{x:point.x+dx,y:point.y+dy}}:task
      })
    },()=>settingsSnapshot(nextZones))
  }
  async function deleteZone(zone:Zone){
    if(zoneSaving)return
    setZoneSaving(true)
    const saved=await updateZones(current=>current.filter(item=>item.id!==zone.id))
    setZoneSaving(false)
    if(!saved)return
    closeZone()
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return
    setLeavingZones(current=>[...current,zone])
    const timer=setTimeout(()=>{
      setLeavingZones(current=>current.filter(item=>item.id!==zone.id))
      zoneAnimatingTimers.current=zoneAnimatingTimers.current.filter(item=>item!==timer)
    },240)
    zoneAnimatingTimers.current.push(timer)
  }
  const useShortcut=useEffectEvent((event:KeyboardEvent)=>{
    if(!ready||!boardView||isEditing||zoneDraft||importing||event.defaultPrevented||event.repeat||event.isComposing)return
    if(!(event.metaKey||event.ctrlKey)||event.altKey)return
    if(event.shiftKey&&event.code==='KeyN'){
      event.preventDefault()
      closeMenu()
      add(0,undefined,undefined,true)
    }else if(!event.shiftKey&&event.code==='KeyF'){
      event.preventDefault()
      setSearchOpen(true)
      document.querySelector<HTMLInputElement>('#board-search input')?.focus()
    }
  })
  useEffect(()=>{
    const shortcut=(event:KeyboardEvent)=>useShortcut(event)
    document.addEventListener('keydown',shortcut)
    return ()=>document.removeEventListener('keydown',shortcut)
  },[])
  function move(id:string,position:Point){
    return save(current=>current.map(task=>task.id===id?{...task,position}:task))
  }
  function field<K extends keyof Task>(k:K,v:Task[K]){
    editorRevision.current++
    setDraft(current=>current?{...current,[k]:v}:current)
  }
  const columns=boardColumns(tasks,today,filter,query,now)
  const overdue=(t:Task)=>!!t.due&&t.stage!==2&&Date.parse(t.due)<=now
  function renderEditor(){
    if(!draft)return null
    return <form ref={editor} className="sticker-editor" aria-label="Редактирование стикера" onSubmit={async e=>{
      e.preventDefault()
      const title=draft.title.trim()
      if(!title)return
      const revision=editorRevision.current
      const saved=await save(current=>{
        const index=current.findIndex(task=>task.id===draft.id)
        if(index<0)return current
        const old=current[index]
        const original=menu?.task
        const edits=Object.fromEntries((Object.keys(draft) as (keyof Task)[])
          .filter(key=>!Object.is(draft[key],original?.[key])).map(key=>[key,draft[key]]))
        const edited:Task={...old,...edits,title}
        const task={...edited,steps:edited.steps?.filter(step=>step.text.trim()),
          position:old.position??notePosition(index),pinged:old.due===edited.due&&old.pinged}
        return current.map(item=>item.id===task.id?task:item)
      })
      if(saved&&revision===editorRevision.current)closeMenu()
    }}><div className="editor-actions">
    <button type="button" aria-label="Закрыть" title="Закрыть" onClick={requestClose}>×</button>
    <button type="submit" aria-label="Сохранить" title="Сохранить">✓</button>
  </div>
  <label className="editor-title"><span className="sr-only">Задача</span><textarea key={String(detailsOpen)} autoFocus required maxLength={200} placeholder="Задача" value={draft.title} onChange={e=>field('title',e.target.value)}/></label>
  {detailsOpen?<div className="editor-details"><label>Заметка<textarea value={draft.note} onChange={e=>field('note',e.target.value)}/></label><label>Метки через запятую<input value={draft.tags||''} onChange={e=>field('tags',e.target.value)}/></label>
  <label>Цвет стикера<select value={draft.paper??paperColors[Math.max(0,tasks.findIndex(task=>task.id===draft.id))%paperColors.length]} onChange={e=>field('paper',e.target.value)}>{paperColors.map(color=><option key={color}>{color}</option>)}</select></label>
  <label>Цвет пина<select value={draft.pinColor??defaultPinColor(draft.id)} onChange={e=>field('pinColor',e.target.value as PinColor)}>{pinColors.map(color=><option key={color}>{color}</option>)}</select></label>
  <fieldset><legend>Чек-лист</legend>{draft.steps?.map(step=><div className="step" key={step.id}>
    <input type="checkbox" aria-label={'Выполнено: '+step.text} checked={step.done} onChange={()=>field('steps',draft.steps?.map(item=>item.id===step.id?{...item,done:!item.done}:item))}/>
    <input aria-label="Название шага" value={step.text} onChange={e=>field('steps',draft.steps?.map(item=>item.id===step.id?{...item,text:e.target.value}:item))}/>
    <button type="button" aria-label={'Удалить шаг '+step.text} onClick={()=>field('steps',draft.steps?.filter(item=>item.id!==step.id))}>×</button></div>)}
    <button type="button" onClick={()=>field('steps',[...(draft.steps||[]),{id:crypto.randomUUID(),text:'',done:false}])}>+ Шаг</button></fieldset>
  <label>Сфера<select value={draft.area} onChange={e=>field('area',e.target.value)}><option>Работа</option><option>Личное</option></select></label><label>Статус<select value={draft.stage} onChange={e=>field('stage',+e.target.value)}>{stages.map((s,i)=><option value={i} key={s}>{s}</option>)}</select></label><label>Напомнить в<input type="datetime-local" value={draft.due} onChange={e=>field('due',e.target.value)}/></label></div>:<button type="button" className="editor-expand" onClick={()=>setDetailsOpen(true)}>Детали</button>}
  {!boardView||detailsOpen?<output>{error}</output>:null}
  </form>
  }
  function card(t:Task){return <button className={'card paper-'+paperColors.findIndex(color=>color===t.paper)} key={t.id} data-sticker-id={t.id} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',t.id)} onDragEnd={()=>setOver(-1)} onDoubleClick={e=>openStickerMenu(t,e.currentTarget)} onContextMenu={e=>{e.preventDefault();openStickerMenu(t,e.currentTarget)}} onClick={e=>{if(e.detail===0)openStickerMenu(t,e.currentTarget)}}><small>{t.area}</small><strong>{t.title||'Пустой стикер'}</strong><span className="tags">{Array.from(new Set((t.tags||'').split(',').map(x=>x.trim()).filter(Boolean))).map(tag=><span key={tag} style={{background:['#e7dcff','#ffddb9','#cbe9df'][tag.length%3]}}>{tag}</span>)}</span>{!!t.steps?.length&&<small>✓ {t.steps.filter(step=>step.done).length} / {t.steps.length}</small>}{t.due&&<small>{overdue(t)?'Пора · ':'◷ '}{new Date(t.due).toLocaleString('ru',{dateStyle:'short',timeStyle:'short'})}</small>}</button>}
  const searchResults=boardView&&query.trim()?columns.flat():[]
  const visible=new Set(columns.flat().map(task=>task.id))
  if(draft)visible.add(draft.id)
  return <><header className={boardView?'board-header':undefined}>
    <b className="logo"><span className="mark" aria-hidden="true">✦</span>пингборд</b>
    <div className="switch">{views.map(label=><button key={label} className={view===label?'active':''} aria-pressed={view===label} disabled={!ready||importing} onClick={()=>{if(!importing&&label!==view&&discardDraft()){closeMenu();preferences(label,filter)}}}>{label}</button>)}</div>
    <details className="backup-menu">
      <summary>Данные</summary>
      <div className="backup-actions">
        <button disabled={!ready||importing} onClick={()=>void handleExport()}>Сохранить копию</button>
        <button disabled={!ready||importing||isEditing||!!zoneDraft} onClick={()=>importFile.current?.click()}>Восстановить из копии</button>
        <input ref={importFile} type="file" accept=".json,application/json" hidden/>
      </div>
    </details>
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
    <input key={boardView?String(searchOpen):'list'} autoFocus={boardView&&searchOpen} aria-label="Поиск задач" placeholder="Поиск задач" value={query} onChange={e=>setQuery(e.target.value)}
      onKeyDown={event=>{
        if(event.key==='Enter'&&searchResults.length){
          event.preventDefault()
          if(!isEditing){closeMenu();setLocated({id:searchResults[0].id});setSearchOpen(false)}
        }
      }}/>
    {searchResults.length>0&&<ul className="board-results" aria-label="Найденные стикеры">
      {searchResults.map(task=><li key={task.id}><button disabled={isEditing} onClick={()=>{
        closeMenu()
        setLocated({id:task.id})
        setSearchOpen(false)
      }}>{task.title||'Пустой стикер'}</button></li>)}
    </ul>}
    {['Все','Работа','Личное'].map(s=><button key={s} className={filter===s?'active':''} aria-pressed={filter===s} disabled={!ready} onClick={()=>preferences(view,s)}>{s}</button>)}
    {view==='Канбан'&&<PaperPalette disabled={!ready} add={paper=>add(0,undefined,paper)}/>}
    {!native&&'Notification' in window&&Notification.permission==='default'&&<button onClick={async()=>{await Notification.requestPermission();setNotify(!notify)}}>Включить уведомления</button>}
  </nav><output>{error}</output>
  {reminderError&&<div className="app-notice" role="status">Не удалось настроить напоминания. <button onClick={()=>void flushReminders()}>Повторить</button></div>}
  {backupStatus&&<div className="app-notice" role="status">{backupStatus} <button aria-label="Закрыть сообщение" onClick={()=>setBackupStatus('')}>×</button></div>}{!today&&tasks.some(overdue)&&<p className={boardView?'board-overdue':undefined}><button onClick={()=>{if(discardDraft()){closeMenu();preferences('Сегодня',filter)}}}>Пора заняться · {tasks.filter(overdue).length} →</button></p>}
  {view==='Доска'?ready&&<StickyBoard key={cameraVersion} located={located} zones={zones} leavingZones={leavingZones} createZone={createZone} editZone={openZone} moveZone={moveZone} initialCamera={camera.current} remember={rememberCamera} scrollEnabled={!isEditing&&!zoneDraft&&!importing} notes={tasks} visible={visible} surface={surface}
    customize={background=>preferences(view,filter,background)} add={(position,paper,avoidOverlap)=>add(0,position,paper,false,avoidOverlap)} edit={openStickerMenu} move={move} editingId={detailsOpen?undefined:draft?.id} renderEditor={renderEditor}/>:<div id="board">{(today?['Пора заняться','Сегодня до конца дня','Ближайшее']:stages).map((s,i)=>{
    const group=columns[i]
    return <section key={s} className={over===i?'over':''} onDragOver={e=>{if(!today){e.preventDefault();setOver(i)}}} onDrop={e=>{e.preventDefault();setOver(-1);if(today)return;const paper=e.dataTransfer.getData(paperDragType);if(paperColors.some(color=>color===paper)){add(i,undefined,paper);return}const id=e.dataTransfer.getData('text/plain');void save(current=>current.some(t=>t.id===id&&t.stage!==i)?current.map(t=>t.id===id?{...t,stage:i}:t):current)}}><h2>{s}<small>{group.length}</small></h2>{group.map(card)}{today&&!group.length&&<small>Задач нет</small>}{!today&&<button className="add" disabled={!ready} onClick={()=>add(i)}>+ Стикер</button>}</section>
  })}</div>}{menu&&!draft&&<div ref={panel} className="sticker-actions" role="group" aria-label="Действия со стикером" style={{left:actionsLeft,top:actionsTop}}>
    <button type="button" autoFocus aria-label="Изменить" title="Изменить" onClick={()=>setDraft({...menu.task})}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/></svg>
    </button>
    {menu.task.stage!==2&&<button type="button" className="done-button" aria-label="Готово" title="Готово" onClick={()=>void complete()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 5 5L20 6"/></svg>
    </button>}
    <button type="button" className="destroy-button" aria-label="Уничтожить" title="Уничтожить" onClick={()=>void removeSticker(menu.task.id)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v6m4-6v6"/></svg>
    </button>
  </div>}{menu&&draft&&(!boardView||detailsOpen)&&<div ref={panel} className="sticker-panel" role="dialog" aria-label="Меню стикера"
    style={{left:panelLeft,top:panelTop,width:panelWidth,maxHeight:Math.max(100,window.innerHeight-panelTop-12)}}>
    {renderEditor()}</div>}
    <dialog ref={zoneDialog} className="zone-dialog" aria-labelledby="zone-dialog-title"
      onCancel={event=>{event.preventDefault();if(!zoneSaving)closeZone()}}>
      {zoneDraft&&<form onSubmit={async event=>{
        event.preventDefault()
        const title=zoneDraft.title.trim()
        if(!title)return
        const item={...zoneDraft,title}
        if(zoneSaving||!readZones([item]))return
        setZoneSaving(true)
        const saved=await updateZones(current=>current.some(zone=>zone.id===item.id)?
          current.map(zone=>zone.id===item.id?item:zone):[...current,item])
        setZoneSaving(false)
        if(saved)closeZone()
      }}>
        <h2 id="zone-dialog-title">Настройки области</h2>
        <fieldset disabled={zoneSaving}>
        <label>Название области<input required maxLength={80} value={zoneDraft.title}
          onChange={event=>setZoneDraft({...zoneDraft,title:event.target.value})}/></label>
        <label>Описание области<textarea rows={3} maxLength={500} value={zoneDraft.description}
          onChange={event=>setZoneDraft({...zoneDraft,description:event.target.value})}/></label>
        <div className="zone-dimensions">
          <label>Ширина<input required type="number" min={220} max={2400} value={zoneDraft.width||''}
            onChange={event=>setZoneDraft({...zoneDraft,width:Number(event.target.value)})}/></label>
          <label>Высота<input required type="number" min={180} max={2400} value={zoneDraft.height||''}
            onChange={event=>setZoneDraft({...zoneDraft,height:Number(event.target.value)})}/></label>
        </div>
        <label>Цвет области<select value={zoneDraft.color}
          onChange={event=>setZoneDraft({...zoneDraft,color:event.target.value as Zone['color']})}>
          {zoneColors.map(color=><option key={color}>{color}</option>)}
        </select></label>
        <output>{error}</output>
        <div className="row">
          {zones.some(zone=>zone.id===zoneDraft.id)&&<button type="button" onClick={()=>void deleteZone(zoneDraft)}>Удалить область</button>}
          <button type="button" onClick={closeZone}>Отмена</button>
          <button className="primary" type="submit">Сохранить область</button>
        </div>
        </fieldset>
      </form>}
    </dialog>
    {lastDeleted&&<div className="undo-toast" role="status">Удалено · {lastDeleted.task.title||'Пустой стикер'} <button onClick={()=>void restore()}>Вернуть</button></div>}</>
}
createRoot(document.getElementById('root')!).render(<App/>)
