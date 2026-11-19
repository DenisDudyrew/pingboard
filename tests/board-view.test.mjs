import test from 'node:test'
import assert from 'node:assert/strict'
import {boardColumns} from '../board-view.ts'
const now=Date.parse('2030-02-01T12:00')
const task=(title,due,stage=0)=>({title,due,area:'Работа',stage})
const cards=[
  task('Завтра','2030-02-02T00:00'), task('Позже','2030-02-03T10:00'),
  task('Сегодня','2030-02-01T23:59',1),task('Пора','2030-02-01T12:00'),
  task('Завершена','2030-01-31T10:00',2),task('Без срока',''),
]
test('Сегодня учитывает границы текущей минуты и местной полуночи',()=>{
  assert.deepEqual(boardColumns(cards,true,'Все','',now),[[cards[3]],[cards[2]],[cards[0]]])
})
test('Поиск по метке вместе с фильтром сферы сохраняет колонку карточки',()=>{
  const work={...cards[2],tags:'Ревью'}
  assert.deepEqual(boardColumns([work,{...work,area:'Личное'},...cards],false,'Работа','рев',now),[[],[work],[]])
})
