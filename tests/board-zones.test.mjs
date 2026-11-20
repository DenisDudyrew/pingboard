import test from 'node:test'
import assert from 'node:assert/strict'
import {readZones,zoneAt,zoneSize} from '../board-zones.ts'

const first={id:'a',x:0,y:0,title:'Задачи',description:'',color:'Мята',...zoneSize}
const second={...first,id:'b',x:200,y:120}

test('Область определяется по центру стикера, при пересечении побеждает верхняя',()=>{
  assert.equal(zoneAt([first,second],{x:116,y:36}),second)
  assert.equal(zoneAt([first,second],{x:115,y:35}),first)
  assert.equal(zoneAt([first,second],{x:536,y:100}),undefined)
})

test('Резервная копия областей отклоняет повторяющиеся ID и неверные размеры',()=>{
  assert.deepEqual(readZones([first,second]),[first,second])
  assert.equal(readZones([first,{...second,id:first.id}]),undefined)
  assert.equal(readZones([{...first,width:0}]),undefined)
  assert.equal(readZones([{...first,y:Infinity}]),undefined)
  assert.equal(readZones([{...first,title:'  '}]),undefined)
})
