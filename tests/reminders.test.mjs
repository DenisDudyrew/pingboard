import test from 'node:test'
import assert from 'node:assert/strict'
import {reminderChanges} from '../reminders.ts'

const task = {id:'a', title:'Проверить отчёт', due:'2030-01-03T14:20', stage:0}
const updated = {...task,due:'2030-01-04T10:30'}
const request = t => ({id:t.id,title:t.title,epoch:Date.parse(t.due)/1000})
const cancel = {...request(task),epoch:0}
for (const [name,before,after,expected] of [
  ['создание',[],[task],[request(task)]],
  ['перенос с тем же идентификатором',[task],[updated],[request(updated)]],
  ['завершение',[task],[{...task,stage:2}],[cancel]],
  ['удаление',[task],[],[cancel]],
  ['снятие срока',[task],[{...task,due:""}],[cancel]],
  ['редактирование заметки',[task],[{...task,note:"текст"}],[]],
  ['переход в работу',[task],[{...task,stage:1}],[]],
  ['возврат из готовых',[{...task,stage:2}],[task],[request(task)]],
  ['новая задача без срока',[],[{...task,due:""}],[]],
]) test(name,()=>assert.deepEqual(reminderChanges(before,after),expected))
