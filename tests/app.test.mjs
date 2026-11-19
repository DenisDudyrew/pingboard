import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {setTimeout as delay} from 'node:timers/promises'
import {JSDOM} from 'jsdom'

const bundle=readFileSync(new URL('../dist/pingboard.js',import.meta.url),'utf8')
async function until(check){
  for(let i=0;i<100;i++){
    if(check())return
    await delay(10)
  }
  assert.ok(check())
}

test('Интерфейс восстанавливает настройки и отменяет напоминание после успешного переноса',async t=>{
  const task={id:'a',title:'Отчёт',stage:0,area:'Работа',due:'2030-01-01T09:00',note:''}
  let tasks=JSON.stringify([task]), settings='{}', fail=true
  const reminders=[]
  const dom=new JSDOM('<main id="root"></main>',{url:'https://pingboard.test',runScripts:'outside-only'})
  t.after(()=>dom.window.close())
  const {window}=dom
  window.__TAURI__={core:{async invoke(command,args){
    switch(command){
      case 'load_tasks':return tasks
      case 'load_settings':return settings
      case 'save_settings':settings=args.data;return
      case 'save_tasks':
        if(fail)throw Error('диск недоступен')
        tasks=args.data;return
      case 'reminder':reminders.push(args);return
      default:throw Error(command)
    }
  }}}
  window.eval(bundle)
  const doc=window.document
  await until(()=>doc.querySelector('.sticky'))
  fail=false
  doc.querySelector('.sticky').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))
  await until(()=>JSON.parse(tasks)[0].position?.x===48)
  await until(()=>doc.querySelector('.sticky').style.left==='48px')
  fail=true
  const kanban=[...doc.querySelectorAll('button')].find(b=>b.textContent==='Канбан')
  kanban.click()
  await until(()=>doc.querySelector('.card'))
  const drop=()=>{
    const event=new window.Event('drop',{bubbles:true,cancelable:true})
    event.dataTransfer={getData:()=>task.id}
    doc.querySelectorAll('section')[2].dispatchEvent(event)
  }
  drop()
  await until(()=>doc.querySelector('output').textContent.includes('диск недоступен'))
  assert.equal(JSON.parse(tasks)[0].stage,0)
  assert.equal(reminders.length,0)
  fail=false
  drop()
  await until(()=>doc.querySelector('section:nth-child(3) .card'))
  assert.deepEqual(JSON.parse(JSON.stringify(reminders)),[{id:'a',title:'Отчёт',epoch:0}])
  const button=name=>[...doc.querySelectorAll('button')].find(b=>b.textContent===name)
  button('Работа').click()
  await until(()=>JSON.parse(settings).filter==='Работа')
  button('Сегодня').click()
  await until(()=>JSON.parse(settings).today)
  assert.equal(doc.querySelectorAll('.card').length,0)
  const reopened=new JSDOM('<main id="root"></main>',{runScripts:'outside-only'})
  t.after(()=>reopened.window.close())
  reopened.window.__TAURI__=window.__TAURI__
  reopened.window.eval(bundle)
  await until(()=>reopened.window.document.querySelector('h1')?.textContent==='Сегодня.')
  assert.equal(reopened.window.document.querySelector('nav .active').textContent,'Работа')
  button('Канбан').click()
  await until(()=>doc.querySelector('[data-sticker-id="a"]'))
  doc.querySelector('dialog').showModal=()=>{}
  doc.querySelector('dialog').close=()=>{}
  const sticker=doc.querySelector('[data-sticker-id="a"]')
  sticker.getBoundingClientRect=()=>new window.DOMRect(20,20,168,168)
  sticker.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true}))
  await until(()=>button('Уничтожить'))
  button('Уничтожить').click()
  await until(()=>button('Оставить'))
  assert.equal(JSON.parse(tasks).length,1)
  button('Оставить').click()
  await until(()=>!button('Да, уничтожить'))
  button('Уничтожить').click()
  await until(()=>button('Да, уничтожить'))
  fail=true
  button('Да, уничтожить').click()
  await until(()=>doc.querySelector('output').textContent.includes('диск недоступен'))
  assert.equal(doc.querySelector('.sticker-ghost'),null)
  assert.equal(JSON.parse(tasks).length,1)
  fail=false
  button('Да, уничтожить').click()
  await until(()=>doc.querySelector('.sticker-ghost'))
  await until(()=>!doc.querySelector('[data-sticker-id="a"]'))
  assert.deepEqual(JSON.parse(tasks),[])

})
