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
  let tasks=JSON.stringify([task]), settings='{}', fail=true, pendingSave
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
        if(pendingSave)await pendingSave
        tasks=args.data;return
      case 'reminder':reminders.push(args);return
      default:throw Error(command)
    }
  }}}
  window.eval(bundle)
  const doc=window.document
  await until(()=>doc.querySelector('.sticky'))
  const searchToggle=doc.querySelector('.board-search-toggle')
  const searchPanel=doc.querySelector('#board-search')
  assert.ok(doc.querySelector('.studio-palette .paper-swatch'))
  assert.ok(searchPanel.hidden)
  searchToggle.click()
  await until(()=>!searchPanel.hidden)
  const search=searchPanel.querySelector('input')
  assert.equal(doc.activeElement,search)
  search.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
  await until(()=>searchPanel.hidden)
  assert.equal(doc.activeElement,searchToggle)
  fail=false
  doc.querySelector('.sticky').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))
  await until(()=>JSON.parse(tasks)[0].position?.x===48)
  await until(()=>doc.querySelector('.sticky').style.translate==='48px 34px')
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
  const button=name=>[...doc.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')??b.textContent)===name)
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
  button('Доска').click()
  await until(()=>doc.querySelector('.sticky'))
  const sticker=doc.querySelector('[data-sticker-id="a"]')
  window.HTMLElement.prototype.setPointerCapture=()=>{}
  const pointer=(type,x)=>Object.assign(new window.MouseEvent(type,{bubbles:true,clientX:x}),{pointerId:1})
  let finishSave
  pendingSave=new Promise(resolve=>{finishSave=resolve})
  sticker.dispatchEvent(pointer('pointerdown',0))
  sticker.dispatchEvent(pointer('pointermove',60))
  sticker.dispatchEvent(pointer('pointerup',75))
  await until(()=>sticker.style.translate==='123px 34px')
  assert.equal(JSON.parse(tasks)[0].position.x,48)
  assert.ok(sticker.classList.contains('moving'))
  finishSave()
  pendingSave=undefined
  await until(()=>!sticker.classList.contains('moving'))
  assert.equal(JSON.parse(tasks)[0].position.x,123)
  assert.equal(sticker.style.translate,'123px 34px')
  sticker.getBoundingClientRect=()=>new window.DOMRect(20,20,168,168)
  sticker.dispatchEvent(pointer('pointerdown',75))
  sticker.dispatchEvent(pointer('pointerup',75))
  sticker.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true}))
  await until(()=>button('Изменить'))
  const actions=doc.querySelector('.sticker-actions')
  assert.equal(actions.querySelectorAll('button svg').length,2)
  assert.equal(actions.textContent.trim(),'')
  assert.equal(doc.querySelector('.sticker-panel'),null)
  sticker.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:2}))
  assert.ok(doc.querySelector('.sticker-actions'))
  doc.querySelector('.pinboard').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:2}))
  await until(()=>!doc.querySelector('.sticker-actions'))
  sticker.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true}))
  await until(()=>button('Изменить'))
  button('Изменить').click()
  await until(()=>doc.querySelector('.sticky-editing form'))
  assert.equal(doc.querySelector('.sticker-panel'),null)
  button('Детали').click()
  await until(()=>doc.querySelector('.sticker-panel form'))
  const pinSelect=[...doc.querySelectorAll('.editor-details select')].find(select=>select.parentElement.textContent.startsWith('Цвет пина'))
  pinSelect.value='Коралл'
  pinSelect.dispatchEvent(new window.Event('change',{bubbles:true}))
  button('Сохранить').click()
  await until(()=>JSON.parse(tasks)[0].pinColor==='Коралл')
  await until(()=>!doc.querySelector('.sticker-panel'))
  const savedSticker=doc.querySelector('[data-sticker-id="a"]')
  assert.ok(savedSticker.querySelector('.pin-1'))
  savedSticker.getBoundingClientRect=()=>new window.DOMRect(20,20,168,168)
  savedSticker.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true}))
  await until(()=>button('Уничтожить'))
  button('Уничтожить').click()
  await until(()=>button('Оставить'))
  assert.equal(JSON.parse(tasks).length,1)
  button('Оставить').click()
  await until(()=>button('Уничтожить'))
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
