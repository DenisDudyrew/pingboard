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
      case 'load_pending_reminders':return '[]'
      case 'ack_reminder':return
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
  doc.querySelector('input[type="datetime-local"]').focus()
  window.dispatchEvent(new window.Event('scroll'))
  await delay(10)
  assert.ok(doc.querySelector('.sticker-panel form'))
  button('Сохранить').click()
  await until(()=>JSON.parse(tasks)[0].pinColor==='Коралл')
  await until(()=>!doc.querySelector('.sticker-panel'))
  const savedSticker=doc.querySelector('[data-sticker-id="a"]')
  assert.ok(savedSticker.querySelector('.pin-1'))
  savedSticker.getBoundingClientRect=()=>new window.DOMRect(20,20,168,168)
  savedSticker.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true}))
  await until(()=>button('Уничтожить'))
  fail=true
  button('Уничтожить').click()
  await until(()=>doc.querySelector('output').textContent.includes('диск недоступен'))
  assert.equal(doc.querySelector('.sticker-ghost'),null)
  assert.equal(JSON.parse(tasks).length,1)
  fail=false
  button('Уничтожить').click()
  await until(()=>doc.querySelector('.sticker-ghost'))
  await until(()=>!doc.querySelector('[data-sticker-id="a"]'))
  assert.deepEqual(JSON.parse(tasks),[])
  button('Вернуть').click()
  await until(()=>JSON.parse(tasks)[0]?.pinColor==='Коралл')
  assert.equal(JSON.parse(tasks)[0].position.x,123)

  doc.querySelector('[aria-label="Увеличить масштаб"]').click()
  await until(()=>JSON.parse(settings).camera.zoom===1.1)
  const board=doc.querySelector('.pinboard')
  const scroll=(deltaX,deltaY,metaKey=false)=>board.dispatchEvent(new window.WheelEvent('wheel',{
    deltaX,deltaY,metaKey,bubbles:true,cancelable:true
  }))
  assert.equal(scroll(24.5,-12),false)
  assert.equal(scroll(5.5,-8),false)
  assert.equal(scroll(0,40,true),true)
  await until(()=>JSON.parse(settings).camera.x===-30)
  assert.deepEqual(JSON.parse(settings).camera,{x:-30,y:20,zoom:1.1})
  assert.equal(JSON.parse(tasks)[0].position.x,123)
  button('Канбан').click()
  await until(()=>doc.querySelector('.card'))
  button('Доска').click()
  await until(()=>doc.querySelector('[aria-label="Масштаб"]')?.textContent==='110%')
  assert.equal(doc.querySelector('.pinboard-plane').style.transform,'translate(-30px,20px) scale(1.1)')
  button('В начало').click()
  await until(()=>doc.querySelector('[aria-label="Масштаб"]')?.textContent==='100%')
  const zoomBoard=doc.querySelector('.pinboard')
  const pinch=(type,scale)=>{
    const event=new window.MouseEvent(type,{clientX:100,clientY:80,bubbles:true,cancelable:true})
    Object.defineProperty(event,'scale',{value:scale})
    return zoomBoard.dispatchEvent(event)
  }
  assert.equal(pinch('gesturestart',1),false)
  assert.equal(pinch('gesturechange',1.25),false)
  assert.equal(pinch('gestureend',1.25),false)
  await until(()=>JSON.parse(settings).camera.zoom===1.25)
  assert.deepEqual(JSON.parse(settings).camera,{x:-25,y:-20,zoom:1.25})
  assert.equal(zoomBoard.dispatchEvent(new window.WheelEvent('wheel',{
    deltaY:500,ctrlKey:true,clientX:100,clientY:80,cancelable:true
  })),false)
  await until(()=>JSON.parse(settings).camera.zoom===0.5)
  assert.deepEqual(JSON.parse(settings).camera,{x:50,y:40,zoom:0.5})
  doc.querySelector('.paper-swatch').click()
  await until(()=>doc.querySelectorAll('.sticky').length===2)
  const fresh=doc.querySelectorAll('.sticky')[1]
  fresh.getBoundingClientRect=()=>new window.DOMRect(30,30,168,168)
  fresh.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true}))
  await until(()=>button('Готово'))
  button('Готово').click()
  await until(()=>JSON.parse(tasks)[1].stage===2)
  await until(()=>doc.querySelector('.celebration'))

})

test('Черновик, очередь действий, повтор напоминания и восстановление копии',async t=>{
  const original={id:'old',title:'Исходный стикер',note:'',area:'Работа',stage:0,due:'',position:{x:240,y:100}}
  let tasks=[original], settings={}, pending=new Map(), reminderDenied=true, attempted=0
  let releaseSave
  const pause=new Promise(resolve=>{releaseSave=resolve})
  let blockFirstSave=true
  const copies=[]
  const bridge={async invoke(command,args){
    switch(command){
      case 'load_tasks':return JSON.stringify(tasks)
      case 'load_settings':return JSON.stringify(settings)
      case 'load_pending_reminders':return JSON.stringify([...pending.values()])
      case 'save_settings':settings=JSON.parse(args.data);return
      case 'save_tasks':
        if(blockFirstSave){blockFirstSave=false;await pause}
        tasks=JSON.parse(args.data)
        if(args.settings)settings=JSON.parse(args.settings)
        for(const item of args.reminders)pending.set(item.id,item)
        return
      case 'reminder':
        attempted++
        if(reminderDenied)throw Error('Доступ к уведомлениям закрыт')
        return
      case 'ack_reminder':pending.delete(args.id);return
      case 'write_backup':copies.push(JSON.parse(args.data));return 'Загрузки/Pingboard.json'
      default:throw Error(command)
    }
  }}
  function open(){
    const dom=new JSDOM('<main id="root"></main>',{url:'https://pingboard.test',runScripts:'outside-only'})
    t.after(()=>dom.window.close())
    dom.window.__TAURI__={core:bridge}
    dom.window.eval(bundle)
    return dom.window
  }
  const window=open()
  const doc=window.document
  const button=(name,document=doc)=>[...document.querySelectorAll('button')]
    .find(item=>(item.getAttribute('aria-label')??item.textContent)===name)
  await until(()=>doc.querySelector('.sticky'))
  const sticker=doc.querySelector('.sticky')
  sticker.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true}))
  await until(()=>button('Изменить'))
  button('Изменить').click()
  await until(()=>button('Детали'))
  button('Детали').click()
  await until(()=>doc.querySelector('.sticker-panel'))
  const note=doc.querySelector('.editor-details textarea')
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(note,'Черновик')
  note.dispatchEvent(new window.Event('input',{bubbles:true}))
  window.dispatchEvent(new window.Event('resize'))
  doc.querySelector('.pinboard').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:2}))
  await delay(20)
  assert.equal(doc.querySelector('.editor-details textarea').value,'Черновик')
  let discardPrompts=0
  window.confirm=()=>{discardPrompts++;return false}
  button('Закрыть').click()
  assert.equal(discardPrompts,1)
  assert.ok(doc.querySelector('.sticker-panel'))
  const swatch=doc.querySelector('.paper-swatch')
  swatch.click()
  swatch.click()
  button('Сохранить').click()
  releaseSave()
  await until(()=>tasks.length===3&&tasks[0].note==='Черновик')
  assert.equal(new Set(tasks.map(task=>task.id)).size,3)
  assert.notDeepEqual(tasks[1].position,tasks[2].position)
  await until(()=>!doc.querySelector('.sticker-panel'))

  doc.dispatchEvent(new window.KeyboardEvent('keydown',{code:'KeyN',key:'N',metaKey:true,shiftKey:true,bubbles:true,cancelable:true}))
  await until(()=>tasks.length===4&&doc.activeElement?.dataset.stickerId===tasks[3].id)
  button('Поиск и фильтры').click()
  await until(()=>!doc.querySelector('#board-search').hidden)
  const search=doc.querySelector('#board-search input')
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(search,'Исходный')
  search.dispatchEvent(new window.Event('input',{bubbles:true}))
  await until(()=>doc.querySelector('.board-results button'))
  doc.querySelector('.board-results button').click()
  await until(()=>doc.activeElement?.dataset.stickerId==='old')

  button('Сохранить копию').click()
  await until(()=>doc.querySelector('.app-notice')?.textContent.includes('Копия сохранена'))
  assert.equal(copies[0].tasks.length,4)
  const restored={...original,id:'restored',title:'Восстановлен',due:'2090-04-10T10:30',steps:[{id:'s',text:'Шаг',done:true}]}
  const backup={version:1,tasks:[restored],settings:{view:'Доска',filter:'Все',surface:'Мята',camera:{x:41,y:53,zoom:1.2}}}
  const fileInput=doc.querySelector('input[type="file"]')
  const importText=data=>{
    const file=new window.File([data],'Pingboard.json')
    Object.defineProperty(fileInput,'files',{configurable:true,value:[file]})
    fileInput.dispatchEvent(new window.Event('change',{bubbles:true}))
  }
  window.confirm=()=>true
  importText(JSON.stringify({...backup,tasks:[restored,restored]}))
  await until(()=>doc.querySelector('.app-notice')?.textContent.includes('Не удалось восстановить'))
  assert.equal(copies.length,1)
  assert.equal(tasks.length,4)
  importText(JSON.stringify(backup))
  await until(()=>doc.querySelector('.app-notice')?.textContent.includes('Не удалось настроить напоминания'))
  assert.deepEqual(tasks,[restored])
  assert.deepEqual(settings,backup.settings)
  assert.equal(copies[1].tasks.length,4)
  assert.equal(pending.size,1)
  assert.equal(attempted,1)
  window.close()
  const reopened=open()
  await until(()=>button('Повторить',reopened.document))
  assert.equal(attempted,2)
  reminderDenied=false
  button('Повторить',reopened.document).click()
  await until(()=>pending.size===0)
  assert.equal(attempted,3)
  assert.equal(reopened.document.querySelector('.pinboard-plane').style.transform,'translate(41px,53px) scale(1.2)')
})
