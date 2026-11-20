import {useEffect, useEffectEvent, useRef, useState, type PointerEvent, type ReactNode} from 'react'

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
type Gesture = {pointer:number,id?:string,start:Point,origin:Point,moved:boolean}

export function notePosition(index:number):Point {
  return {x:28+(index%3)*196,y:34+Math.floor(index/3)*196}
}

export function StickyBoard<T extends Note>({notes, visible, surface, customize, add, edit, move, editingId, renderEditor, initialCamera, remember, scrollEnabled, located}:{
  initialCamera:Camera, remember:(state:Camera,gesture?:boolean)=>void, scrollEnabled:boolean, located:{id:string}|null,
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
  const [preview,setPreview]=useState<{id:string,point:Point}|null>(null)
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

  function start(event:PointerEvent<HTMLElement>,origin:Point,id?:string){
    if(id)event.stopPropagation()
    if(event.button!==0||gesture.current||(id&&committing.current))return
    event.currentTarget.setPointerCapture(event.pointerId)
    suppressClick.current=null
    gesture.current={pointer:event.pointerId,id,start:{x:event.clientX,y:event.clientY},origin,moved:false}
  }
  function displacement(event:PointerEvent<HTMLElement>,drag:Gesture){
    return {x:event.clientX-drag.start.x,y:event.clientY-drag.start.y}
  }
  function position(drag:Gesture,delta:Point){
    const scale=drag.id?zoom:1
    return {x:Math.round(drag.origin.x+delta.x/scale),y:Math.round(drag.origin.y+delta.y/scale)}
  }
  function drag(event:PointerEvent<HTMLElement>){
    const current=gesture.current
    if(!current||event.pointerId!==current.pointer)return
    event.stopPropagation()
    const delta=displacement(event,current)
    if(!current.moved&&Math.hypot(delta.x,delta.y)<5)return
    current.moved=true
    const point=position(current,delta)
    if(current.id)setPreview({id:current.id,point})
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
    const point=position(current,displacement(event,current))
    setPreview({id:current.id,point})
    committing.current=true
    void move(current.id,point).finally(()=>{
      committing.current=false
      setPreview(null)
    })
  }
  return <div className="studio">
    <div ref={viewport} className={'pinboard surface-'+surfaces.indexOf(surface as typeof surfaces[number])+(panning?' panning':'')} aria-label="Доска со стикерами"
      style={{backgroundPosition:`${camera.x}px ${camera.y}px`}}
      onPointerDown={event=>start(event,currentCamera.current)} onPointerMove={drag} onPointerUp={event=>end(event)}
      onPointerCancel={event=>end(event,true)} onLostPointerCapture={event=>end(event,true)}
      onDragOver={event=>{if(event.dataTransfer.types.includes(paperDragType)){event.preventDefault();event.dataTransfer.dropEffect='copy'}}}
      onDrop={event=>{
        const paper=event.dataTransfer.getData(paperDragType)
        if(!paperColors.some(color=>color===paper))return
        event.preventDefault()
        const rect=event.currentTarget.getBoundingClientRect()
        add({x:Math.round((event.clientX-rect.left-camera.x)/zoom-84),y:Math.round((event.clientY-rect.top-camera.y)/zoom-36)},paper)
      }}>
      {!visible.size&&<p className="board-hint">{notes.length?'По этому фильтру стикеров нет':'Перетащи сюда стикер из палитры'}</p>}
      <div className="pinboard-plane" style={{transform:`translate(${camera.x}px,${camera.y}px) scale(${zoom})`}}>
        {notes.map((note,index)=>{
          if(!visible.has(note.id))return null
          const moving=preview?.id===note.id
          const point=moving?preview.point:note.position??notePosition(index)
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
              const offsets:Record<string,Point>={ArrowUp:{x:0,y:-20},ArrowDown:{x:0,y:20},ArrowLeft:{x:-20,y:0},ArrowRight:{x:20,y:0}}
              const offset=offsets[event.key]
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
    </div>
    <div className="studio-toolbar">
      <label>Фон доски<select value={surface} onChange={event=>customize(event.target.value)}>{surfaces.map(value=><option key={value}>{value}</option>)}</select></label>
    </div>
    <div className="zoom-controls">
        <button aria-label="Уменьшить масштаб" disabled={zoom<=0.5} onClick={()=>changeZoom(Math.max(0.5,zoom-0.1))}>−</button>
        <output aria-label="Масштаб">{Math.round(zoom*100)}%</output>
        <button aria-label="Увеличить масштаб" disabled={zoom>=1.5} onClick={()=>changeZoom(Math.min(1.5,zoom+0.1))}>+</button>
        <button onClick={()=>remember(setCamera({x:0,y:0},1))}>В начало</button>
    </div>
  </div>
}
