export type Point={x:number,y:number}
export const zoneColors=['Сирень','Мята','Песок','Небо','Роза'] as const
export const zoneColorValues=['#ac93d9','#7db9aa','#cbab68','#81aed0','#ca8aa6']
export const zoneSize={width:420,height:300}
export const zoneMinimum={width:220,height:180}
export const resizeEdges=['n','ne','e','se','s','sw','w','nw'] as const
export type ResizeEdge=typeof resizeEdges[number]
export function resizeBounds(zone:Zone,edge:ResizeEdge,delta:Point){
  const dx=Math.round(delta.x),dy=Math.round(delta.y)
  const width=Math.min(2400,Math.max(zoneMinimum.width,zone.width+(edge.includes('w')?-dx:edge.includes('e')?dx:0)))
  const height=Math.min(2400,Math.max(zoneMinimum.height,zone.height+(edge.includes('n')?-dy:edge.includes('s')?dy:0)))
  return {x:zone.x+(edge.includes('w')?zone.width-width:0),y:zone.y+(edge.includes('n')?zone.height-height:0),width,height}
}

export const stickerCenter=84

export type Zone=Point & {
  id:string
  title:string
  description:string
  color:typeof zoneColors[number]
  width:number
  height:number
}

export function readZones(value:unknown):Zone[]|undefined{
  if(!Array.isArray(value))return
  const ids=new Set<string>()
  for(const zone of value){
    if(!zone||typeof zone.id!=='string'||!zone.id||ids.has(zone.id)||
      typeof zone.title!=='string'||!zone.title.trim()||zone.title.length>80||
      typeof zone.description!=='string'||zone.description.length>500||!zoneColors.includes(zone.color)||
      !Number.isFinite(zone.x)||!Number.isFinite(zone.y)||
      !Number.isInteger(zone.width)||zone.width<zoneMinimum.width||zone.width>2400||
      !Number.isInteger(zone.height)||zone.height<zoneMinimum.height||zone.height>2400)return
    ids.add(zone.id)
  }
  return value
}

// The topmost area containing the center of the sticker owns its movement.
export function zoneAt(zones:Zone[],point:Point){
  const x=point.x+stickerCenter
  const y=point.y+stickerCenter
  for(let index=zones.length-1;index>=0;index--){
    const zone=zones[index]
    if(x>=zone.x&&x<zone.x+zone.width&&y>=zone.y&&y<zone.y+zone.height)return zone
  }
}
