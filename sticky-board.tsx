import {useRef, useState, type PointerEvent} from 'react'

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
export const surfaces = ['Сетка','Пробка','Графит'] as const
export type Point = {x:number,y:number}
type Note = {id:string,title:string,note:string,stage:number,paper?:string,position?:Point}
type Gesture = {pointer:number,id?:string,start:Point,origin:Point,moved:boolean}

export function notePosition(index:number):Point {
  return {x:28+(index%3)*196,y:34+Math.floor(index/3)*196}
}

export function StickyBoard<T extends Note>({notes, visible, surface, customize, add, edit, move}:{
  notes:T[], visible:Set<string>, surface:string, customize:(surface:string)=>void,
  add:(position:Point,paper?:string)=>void, edit:(note:T)=>void, move:(id:string,position:Point)=>void
}) {
  const [camera,setCamera]=useState<Point>({x:0,y:0})
  const [zoom,setZoom]=useState(1)
  const [preview,setPreview]=useState<{id:string,point:Point}|null>(null)
  const [panning,setPanning]=useState(false)
  const viewport=useRef<HTMLDivElement>(null)
  const gesture=useRef<Gesture|null>(null)
  const suppressClick=useRef<string|null>(null)

  function start(event:PointerEvent<HTMLElement>,origin:Point,id?:string){
    if(event.button!==0||gesture.current)return
    event.stopPropagation()
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
    setPanning(false);setPreview(null)
    if(!current.id||!current.moved)return
    suppressClick.current=current.id
    if(!cancel)move(current.id,position(current,displacement(event,current)))
  }
  return <div className="studio">
    <div className="studio-toolbar">
      <label>Фон доски<select value={surface} onChange={event=>customize(event.target.value)}>{surfaces.map(value=><option key={value}>{value}</option>)}</select></label>
      <div className="zoom-controls">
        <PaperPalette add={paper=>{
          const width=viewport.current?.clientWidth??400
          const height=viewport.current?.clientHeight??360
          const point={x:Math.round((width/2-camera.x)/zoom-84),y:Math.round((height/2-camera.y)/zoom-84)}
          const occupied=notes.map((note,index)=>note.position??notePosition(index))
          while(occupied.some(other=>Math.abs(other.x-point.x)<35&&Math.abs(other.y-point.y)<35)){
            point.x+=36
            point.y+=16
          }
          add(point,paper)
        }}/>
        <button aria-label="Уменьшить масштаб" disabled={zoom<=0.5} onClick={()=>setZoom(Math.max(0.5,zoom-0.1))}>−</button>
        <output aria-label="Масштаб">{Math.round(zoom*100)}%</output>
        <button aria-label="Увеличить масштаб" disabled={zoom>=1.5} onClick={()=>setZoom(Math.min(1.5,zoom+0.1))}>+</button>
        <button onClick={()=>{setCamera({x:0,y:0});setZoom(1)}}>В начало</button>
      </div>
    </div>
    <div ref={viewport} className={'pinboard surface-'+surfaces.indexOf(surface as typeof surfaces[number])+(panning?' panning':'')} aria-label="Доска со стикерами"
      style={{backgroundPosition:`${camera.x}px ${camera.y}px`}}
      onPointerDown={event=>start(event,camera)} onPointerMove={drag} onPointerUp={event=>end(event)}
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
          return <button key={note.id} type="button"
            className={`sticky paper-${color<0?index%paperColors.length:color}${moving?' moving':''}${note.stage===2?' completed':''}`}
            style={{left:point.x,top:point.y}}
            onPointerDown={event=>start(event,point,note.id)}
            onClick={event=>{
              if(event.detail===0)edit(note)
            }}
            onDoubleClick={()=>{if(suppressClick.current!==note.id)edit(note)}}
            onKeyDown={event=>{
              const offsets:Record<string,Point>={ArrowUp:{x:0,y:-20},ArrowDown:{x:0,y:20},ArrowLeft:{x:-20,y:0},ArrowRight:{x:20,y:0}}
              const offset=offsets[event.key]
              if(!offset)return
              event.preventDefault()
              move(note.id,{x:point.x+offset.x,y:point.y+offset.y})
            }}>
            <span className="pin" aria-hidden="true"/>
            <strong>{note.title||'Пустой стикер'}</strong>
            <span className="sticky-copy">{note.note}</span>
            {note.stage===2&&<span className="sticky-check" aria-label="Выполнено">✓</span>}
          </button>
        })}
      </div>
    </div>
    <p className="board-controls-help">Пустой фон — перемещение по доске · Двойной щелчок по стикеру — редактирование</p>
  </div>
}
