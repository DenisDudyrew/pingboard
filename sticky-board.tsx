import {zoneAt,zoneColors,zoneColorValues,zoneSize,resizeBounds,resizeEdges,type ResizeEdge,type Zone} from './board-zones'
import {useEffect, useEffectEvent, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode} from 'react'

export const paperColors = ['Лимон','Сирень','Мята','Персик','Голубой'] as const
export const paperDragType='application/x-pingboard-paper'
export function PaperPalette({add,disabled=false}:{add:(paper:string)=>void,disabled?:boolean}){
  return <div className="paper-palette" role="group" aria-label="Палитра стикеров">
    {paperColors.map((paper,index)=><button key={paper} disabled={disabled} type="button" draggable={!disabled}
      className={`paper-swatch paper-${index}`} title={paper} aria-label={`Добавить стикер: ${paper}`}
      onDragStart={event=>{event.dataTransfer.setData(paperDragType,paper);event.dataTransfer.effectAllowed='copy'}}
      onClick={()=>add(paper)}>+</button>)}
  </div>
}
export const surfaces = ['Сетка','Облако','Графит','Линии','Мята'] as const
export const pinColors=['Слива','Коралл','Мята','Лазурь','Янтарь'] as const
export type PinColor=typeof pinColors[number]

function pinSeed(id:string){
  let seed=0
  for(const character of id)seed=(Math.imul(seed,31)+character.charCodeAt(0))>>>0
  return seed
}

export function defaultPinColor(id:string):PinColor{
  return pinColors[pinSeed(id)%pinColors.length]
}

export type Point = {x:number,y:number}
type Camera = Point & {zoom:number}
type PinchEvent = MouseEvent & {scale:number}
type Note = {id:string,title:string,note:string,stage:number,paper?:string,pinColor?:PinColor,position?:Point}
type Gesture = {pointer:number,id?:string,zone?:boolean,resize?:{zone:Zone,edge:ResizeEdge},start:Point,origin:Point,moved:boolean}

export function notePosition(index:number):Point {
  return {x:28+(index%3)*196,y:34+Math.floor(index/3)*196}
}

export function StickyBoard<T extends Note>({notes, visible, surface, customize, add, edit, move, editingId, renderEditor, initialCamera, remember, scrollEnabled, located, zones, leavingZones, createZone, editZone, moveZone, resizeZone}:{
  initialCamera:Camera, remember:(state:Camera,gesture?:boolean)=>void, scrollEnabled:boolean, located:{id:string}|null,
  zones:Zone[], leavingZones:Zone[], createZone:(position:Point)=>void, editZone:(zone:Zone,anchor:HTMLElement)=>void, moveZone:(id:string,position:Point)=>Promise<boolean>,
  resizeZone:(id:string,bounds:ReturnType<typeof resizeBounds>)=>Promise<boolean>,
  notes:T[], visible:Set<string>, surface:string, customize:(surface:string)=>void,
  add:(position:Point,paper?:string,avoidOverlap?:boolean)=>void, edit:(note:T,anchor:HTMLElement)=>void, move:(id:string,position:Point)=>Promise<boolean>, editingId?:string, renderEditor:()=>ReactNode
}) {
  const [camera,setCameraState]=useState(initialCamera)
  const currentCamera=useRef(initialCamera)
  function setCamera(point:Point,zoom=currentCamera.current.zoom){
    const next={...point,zoom}
    currentCamera.current=next
    setCameraState(next)
    return next
  }
  const {zoom}=camera
  function changeZoom(value:number){remember(setCamera(currentCamera.current,value))}
  const [preview,setPreview]=useState<{id:string,point:Point,zone?:boolean,bounds?:ReturnType<typeof resizeBounds>}|null>(null)
  const [panning,setPanning]=useState(false)
  const viewport=useRef<HTMLDivElement>(null)
  const committing=useRef(false)
  const gesture=useRef<Gesture|null>(null)
  const pinchScale=useRef<number|null>(null)
  const suppressClick=useRef<string|null>(null)

  function zoomAt(element:HTMLDivElement,event:MouseEvent,factor:number){
    const current=currentCamera.current
    const nextZoom=Math.max(0.5,Math.min(1.5,current.zoom*factor))
    if(nextZoom===current.zoom)return
    const bounds=element.getBoundingClientRect()
    const x=Number.isFinite(event.clientX)?event.clientX-bounds.left:bounds.width/2
    const y=Number.isFinite(event.clientY)?event.clientY-bounds.top:bounds.height/2
    const ratio=nextZoom/current.zoom
    remember(setCamera({x:x+(current.x-x)*ratio,y:y+(current.y-y)*ratio},nextZoom),true)
  }

  const scrollBoard=useEffectEvent((event:WheelEvent,element:HTMLDivElement)=>{
    if(!scrollEnabled||gesture.current||event.defaultPrevented||event.metaKey)return
    if(!event.deltaX&&!event.deltaY)return
    event.preventDefault()
    const lineHeight=16
    const horizontalUnit=event.deltaMode===1?lineHeight:event.deltaMode===2?element.clientWidth:1
    const verticalUnit=event.deltaMode===1?lineHeight:event.deltaMode===2?element.clientHeight:1
    if(event.ctrlKey){
      if(pinchScale.current===null)zoomAt(element,event,Math.exp(-event.deltaY*verticalUnit*0.01))
      return
    }
    const point={
      x:currentCamera.current.x-event.deltaX*horizontalUnit,
      y:currentCamera.current.y-event.deltaY*verticalUnit
    }
    remember(setCamera(point),true)
  })
  const pinchBoard=useEffectEvent((event:PinchEvent,element:HTMLDivElement)=>{
    if(event.type==='gestureend'){
      if(pinchScale.current!==null)event.preventDefault()
      pinchScale.current=null
      return
    }
    if(!scrollEnabled||gesture.current||event.defaultPrevented)return
    if(event.type==='gesturestart'){
      event.preventDefault()
      pinchScale.current=1
      return
    }
    const previous=pinchScale.current
    if(previous===null||!Number.isFinite(event.scale)||event.scale<=0)return
    event.preventDefault()
    pinchScale.current=event.scale
    zoomAt(element,event,event.scale/previous)
  })
  useEffect(()=>{
    const element=viewport.current
    if(!element)return
    const wheel=(event:WheelEvent)=>scrollBoard(event,element)
    const pinch=(event:Event)=>pinchBoard(event as PinchEvent,element)
    const pinchEvents=['gesturestart','gesturechange','gestureend']
    element.addEventListener('wheel',wheel,{passive:false})
    for(const type of pinchEvents)element.addEventListener(type,pinch,{passive:false})
    return ()=>{
      element.removeEventListener('wheel',wheel)
      for(const type of pinchEvents)element.removeEventListener(type,pinch)
    }
  },[])

  const focusLocated=useEffectEvent((id:string)=>{
    const element=viewport.current
    const index=notes.findIndex(note=>note.id===id)
    if(!element||index<0||!visible.has(id))return
    const point=notes[index].position??notePosition(index)
    const zoom=currentCamera.current.zoom
    remember(setCamera({
      x:element.clientWidth/2-(point.x+84)*zoom,
      y:element.clientHeight/2-(point.y+84)*zoom
    }))
    const sticker=Array.from(element.querySelectorAll<HTMLButtonElement>('button[data-sticker-id]'))
      .find(button=>button.dataset.stickerId===id)
    sticker?.focus({preventScroll:true})
  })
  useEffect(()=>{
    if(located)focusLocated(located.id)
  },[located])

  function start(event:PointerEvent<HTMLElement>,origin:Point,id?:string,zone=false,resize?:Gesture['resize']){
    if(id)event.stopPropagation()
    if(event.button!==0||gesture.current||(id&&committing.current))return
    event.currentTarget.setPointerCapture(event.pointerId)
    suppressClick.current=null
    gesture.current={pointer:event.pointerId,id,zone,resize,start:{x:event.clientX,y:event.clientY},origin,moved:false}
  }
  function displacement(event:PointerEvent<HTMLElement>,drag:Gesture){
    return {x:event.clientX-drag.start.x,y:event.clientY-drag.start.y}
  }
  function position(drag:Gesture,delta:Point){
    const scale=drag.id?zoom:1
    return {x:Math.round(drag.origin.x+delta.x/scale),y:Math.round(drag.origin.y+delta.y/scale)}
  }
  function objectPreview(current:Gesture,id:string,delta:Point){
    const bounds=current.resize&&resizeBounds(current.resize.zone,current.resize.edge,{x:delta.x/zoom,y:delta.y/zoom})
    return {id,point:bounds??position(current,delta),zone:current.zone,bounds}
  }
  function drag(event:PointerEvent<HTMLElement>){
    const current=gesture.current
    if(!current||event.pointerId!==current.pointer)return
    event.stopPropagation()
    const delta=displacement(event,current)
    if(!current.moved&&Math.hypot(delta.x,delta.y)<5)return
    current.moved=true
    const point=position(current,delta)
    if(current.id)setPreview(objectPreview(current,current.id,delta))
    else{setPanning(true);setCamera(point)}
  }
  function end(event:PointerEvent<HTMLElement>,cancel=false){
    const current=gesture.current
    if(!current||event.pointerId!==current.pointer)return
    gesture.current=null
    event.stopPropagation()
    if(!current.id&&current.moved){
      const finalCamera=cancel?currentCamera.current:position(current,displacement(event,current))
      remember(setCamera(finalCamera))
    }
    setPanning(false)
    if(!current.id||!current.moved)return
    suppressClick.current=current.id
    if(cancel){setPreview(null);return}
    const next=objectPreview(current,current.id,displacement(event,current))
    setPreview(next)
    committing.current=true
    const saved=next.bounds?resizeZone(current.id,next.bounds):current.zone?moveZone(current.id,next.point):move(current.id,next.point)
    void saved.finally(()=>{
      committing.current=false
      setPreview(null)
    })
  }
  const zoneDragType='application/x-pingboard-zone'
  function createCenteredZone(){
    const element=viewport.current
    if(!element)return
    const {x,y,zoom}=currentCamera.current
    createZone({x:Math.round((element.clientWidth/2-x)/zoom-zoneSize.width/2),
      y:Math.round((element.clientHeight/2-y)/zoom-zoneSize.height/2)})
  }
  const boardShortcut=useEffectEvent((event:KeyboardEvent)=>{
    if(!scrollEnabled||event.defaultPrevented||event.isComposing||event.altKey||!(event.metaKey||event.ctrlKey))return
    const target=event.target
    if(target instanceof HTMLElement&&target.closest('input,textarea,select,[contenteditable]'))return
    if(event.shiftKey&&event.code==='KeyA'&&!event.repeat){
      event.preventDefault()
      createCenteredZone()
    }else if(event.code==='Equal'||event.code==='NumpadAdd'){
      event.preventDefault()
      changeZoom(Math.min(1.5,currentCamera.current.zoom+0.1))
    }else if(!event.shiftKey&&(event.code==='Minus'||event.code==='NumpadSubtract')){
      event.preventDefault()
      changeZoom(Math.max(0.5,currentCamera.current.zoom-0.1))
    }else if(!event.shiftKey&&(event.code==='Digit0'||event.code==='Numpad0')){
      event.preventDefault()
      remember(setCamera({x:0,y:0},1))
    }
  })
  useEffect(()=>{
    const shortcut=(event:KeyboardEvent)=>boardShortcut(event)
    document.addEventListener('keydown',shortcut)
    return ()=>document.removeEventListener('keydown',shortcut)
  },[])
  const movingZone=preview?.zone&&!preview.bounds?zones.find(zone=>zone.id===preview.id):undefined
  const arrows:Record<string,Point>={ArrowUp:{x:0,y:-20},ArrowDown:{x:0,y:20},ArrowLeft:{x:-20,y:0},ArrowRight:{x:20,y:0}}
  function zoneStyle(zone:Zone){
    const active=preview?.zone&&preview.id===zone.id?preview:undefined
    const point=active?.point??zone
    const size=active?.bounds??zone
    return {left:point.x,top:point.y,width:size.width,height:size.height,
      '--zone-color':zoneColorValues[zoneColors.indexOf(zone.color)],'--zone-ui-scale':1/zoom} as CSSProperties
  }
  return <div className="studio">
    <div ref={viewport} className={'pinboard surface-'+surfaces.indexOf(surface as typeof surfaces[number])+(panning?' panning':'')} aria-label="Доска со стикерами"
      style={{backgroundPosition:`${camera.x}px ${camera.y}px`}}
      onPointerDown={event=>start(event,currentCamera.current)} onPointerMove={drag} onPointerUp={event=>end(event)}
      onPointerCancel={event=>end(event,true)} onLostPointerCapture={event=>end(event,true)}
      onDragOver={event=>{if(event.dataTransfer.types.includes(paperDragType)||event.dataTransfer.types.includes(zoneDragType)){event.preventDefault();event.dataTransfer.dropEffect='copy'}}}
      onDrop={event=>{
        const rect=event.currentTarget.getBoundingClientRect()
        const x=(event.clientX-rect.left-camera.x)/zoom
        const y=(event.clientY-rect.top-camera.y)/zoom
        if(event.dataTransfer.types.includes(zoneDragType)){
          event.preventDefault()
          createZone({x:Math.round(x-24/zoom),y:Math.round(y-16/zoom)})
          return
        }
        const paper=event.dataTransfer.getData(paperDragType)
        if(!paperColors.some(color=>color===paper))return
        event.preventDefault()
        add({x:Math.round(x-84),y:Math.round(y-36)},paper)
      }}>
      {!visible.size&&!zones.length&&<p className="board-hint">{notes.length?'По этому фильтру стикеров нет':'Перетащи сюда стикер из палитры'}</p>}
      <div className="pinboard-plane" style={{transform:`translate(${camera.x}px,${camera.y}px) scale(${zoom})`}}>
        {zones.map(zone=><div key={zone.id} className="board-zone" data-zone-id={zone.id} style={zoneStyle(zone)}
          onPointerDown={event=>start(event,zone,zone.id,true)}
          onDoubleClick={event=>{if(suppressClick.current!==zone.id)editZone(zone,event.currentTarget)}}
          onContextMenu={event=>{event.preventDefault();editZone(zone,event.currentTarget)}}/>)}
        {leavingZones.map(zone=><div key={zone.id} className="board-zone zone-leaving" style={zoneStyle(zone)} aria-hidden="true"/>)}
        {leavingZones.map(zone=><div key={zone.id} className="board-zone-header zone-leaving" style={zoneStyle(zone)} aria-hidden="true">
          <div className="board-zone-title"><span>{zone.title}</span></div>
          {zone.description&&<p>{zone.description}</p>}
        </div>)}
        {zones.map(zone=><div key={zone.id} className="board-zone-header" style={zoneStyle(zone)}>
          <button type="button" className="board-zone-title" title={zone.title} aria-label={'Настроить область: '+zone.title}
            onPointerDown={event=>start(event,zone,zone.id,true)}
            onClick={event=>{if(event.detail===0)editZone(zone,event.currentTarget)}}
            onDoubleClick={event=>{if(suppressClick.current!==zone.id)editZone(zone,event.currentTarget)}}
            onContextMenu={event=>{event.preventDefault();editZone(zone,event.currentTarget)}}
            onKeyDown={event=>{
              const offset=arrows[event.key]
              if(!offset||event.metaKey||event.ctrlKey||event.altKey)return
              event.preventDefault()
              void moveZone(zone.id,{x:zone.x+offset.x,y:zone.y+offset.y})
            }}><span>{zone.title}</span><span aria-hidden="true">⋯</span></button>
          {zone.description&&<p>{zone.description}</p>}
          {resizeEdges.map(edge=><span key={edge} className="zone-resize" data-edge={edge} aria-hidden="true"
            onPointerDown={event=>start(event,zone,zone.id,true,{zone,edge})}/>)}
        </div>)}
        {notes.map((note,index)=>{
          if(!visible.has(note.id))return null
          const moving=!preview?.zone&&preview?.id===note.id
          const origin=note.position??notePosition(index)
          const grouped=movingZone&&preview&&zoneAt(zones,origin)?.id===movingZone.id
          const point=moving?preview.point:grouped?
            {x:origin.x+preview.point.x-movingZone.x,y:origin.y+preview.point.y-movingZone.y}:origin
          const color=paperColors.indexOf(note.paper as typeof paperColors[number])
          const paperClass=`paper-${color<0?index%paperColors.length:color}`
          const seed=pinSeed(note.id)
          const pin=<span className={`pin pin-${pinColors.indexOf(note.pinColor??defaultPinColor(note.id))}`}
            style={{left:18+Math.floor(seed/5)%120,top:4+Math.floor(seed/601)%4}} aria-hidden="true"/>
          if(editingId===note.id)return <div key={note.id} data-sticker-id={note.id}
            className={`sticky sticky-editing ${paperClass}`} style={{left:point.x,top:point.y}} onPointerDown={event=>event.stopPropagation()}>
            {renderEditor()}
          </div>
          return <button key={note.id} data-sticker-id={note.id} type="button"
            className={`sticky ${paperClass}${moving?' moving':''}${note.stage===2?' completed':''}`}
            style={{left:0,top:0,translate:`${point.x}px ${point.y}px`}}
            onPointerDown={event=>start(event,point,note.id)}
            onClick={event=>{
              if(event.detail===0)edit(note,event.currentTarget)
            }}
            onDoubleClick={event=>{if(suppressClick.current!==note.id)edit(note,event.currentTarget)}}
            onContextMenu={event=>{event.preventDefault();edit(note,event.currentTarget)}}
            onKeyDown={event=>{
              const offset=arrows[event.key]
              if(!offset)return
              event.preventDefault()
              void move(note.id,{x:point.x+offset.x,y:point.y+offset.y})
            }}>
            {pin}
            <strong>{note.title||'Пустой стикер'}</strong>
            <span className="sticky-copy">{note.note}</span>
            {note.stage===2&&<span className="sticky-check" aria-label="Выполнено">✓</span>}
          </button>
        })}
      </div>
    </div>
    <div className="studio-palette">
        <PaperPalette add={paper=>{
          const width=viewport.current?.clientWidth??400
          const height=viewport.current?.clientHeight??360
          const point={x:Math.round((width/2-camera.x)/zoom-84),y:Math.round((height/2-camera.y)/zoom-84)}
          add(point,paper,true)
        }}/>
        <button className="zone-palette-button" type="button" draggable={scrollEnabled} disabled={!scrollEnabled}
          aria-label="Добавить область" aria-keyshortcuts="Meta+Shift+A Control+Shift+A" title="Добавить область · ⌘⇧A"
          onClick={createCenteredZone} onDragStart={event=>{
            event.dataTransfer.setData(zoneDragType,'zone')
            event.dataTransfer.effectAllowed='copy'
          }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M8 9h8M12 12v4m-2-2h4"/></svg>
        </button>
    </div>
    <div className="studio-toolbar">
      <label>Фон доски<select value={surface} onChange={event=>customize(event.target.value)}>{surfaces.map(value=><option key={value}>{value}</option>)}</select></label>
      <details className="shortcut-help">
        <summary aria-label="Горячие клавиши" title="Горячие клавиши">⌨</summary>
        <dl>
          <dt>Новый стикер</dt><dd>⌘⇧N</dd>
          <dt>Новая область</dt><dd>⌘⇧A</dd>
          <dt>Поиск</dt><dd>⌘F</dd>
          <dt>Масштаб</dt><dd>⌘+ / ⌘−</dd>
          <dt>В начало</dt><dd>⌘0</dd>
          <dt>Двигать выбранное</dt><dd>← ↑ ↓ →</dd>
        </dl>
      </details>
    </div>
    <div className="zoom-controls">
        <button aria-label="Уменьшить масштаб" disabled={zoom<=0.5} onClick={()=>changeZoom(Math.max(0.5,zoom-0.1))}>−</button>
        <output aria-label="Масштаб">{Math.round(zoom*100)}%</output>
        <button aria-label="Увеличить масштаб" disabled={zoom>=1.5} onClick={()=>changeZoom(Math.min(1.5,zoom+0.1))}>+</button>
        <button onClick={()=>remember(setCamera({x:0,y:0},1))}>В начало</button>
    </div>
  </div>
}
