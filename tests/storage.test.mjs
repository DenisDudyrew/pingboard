import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const sql = name => readFileSync(new URL('../src-tauri/src/'+name+'.sql',import.meta.url),'utf8')
test('SQLite восстанавливает карточку после закрытия базы и сохраняет удаление',t=>{
  const folder=mkdtempSync(join(tmpdir(),'pingboard-test-'))
  t.after(()=>rmSync(folder,{recursive:true,force:true}))
  function open(){
    const db=new DatabaseSync(join(folder,'pingboard.sqlite'))
    db.exec(sql('initialize'))
    return db
  }
  const load=db=>JSON.parse(Object.values(db.prepare(sql('load')).get())[0])
  const task={id:'1',title:'План',due:'2030-01-01T09:00',stage:0,steps:[{id:'s',text:'Шаг',done:false}]}
  let db=open()
  assert.deepEqual(load(db),[])
  db.prepare(sql('save')).run(JSON.stringify([task]))
  db.close()
  db=open()
  assert.deepEqual(load(db),[task])
  db.prepare(sql('save')).run('[]')
  db.close()
  db=open()
  assert.deepEqual(load(db),[])
  db.close()
})

test('Настройки добавляются к прежней базе и переживают повторное открытие',t=>{
  const folder=mkdtempSync(join(tmpdir(),'pingboard-upgrade-'))
  t.after(()=>rmSync(folder,{recursive:true,force:true}))
  const file=join(folder,'board.sqlite')
  let db=new DatabaseSync(file)
  db.exec('CREATE TABLE board (id INTEGER PRIMARY KEY, tasks TEXT NOT NULL)')
  const tasks=JSON.stringify([{id:'legacy',title:'Старая задача'}])
  db.prepare(sql('save')).run(tasks)
  db.exec(sql('initialize'))
  const settings=()=>JSON.parse(Object.values(db.prepare(sql('load_settings')).get())[0])
  assert.deepEqual(settings(),{})
  const options={today:true,filter:'Работа'}
  db.prepare(sql('save_settings')).run(JSON.stringify(options))
  db.close()
  db=new DatabaseSync(file)
  db.exec(sql('initialize'))
  assert.deepEqual(settings(),options)
  assert.equal(Object.values(db.prepare(sql('load')).get())[0],tasks)
  db.close()
})
