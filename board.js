const el = id => document.getElementById(id)
const stages = ['В планах','В работе','Готово']
const form = el('form'), fields = form.elements
let tasks = JSON.parse(localStorage.getItem('pingboard.tasks') || '[]')
let filter = 'Все', query = '', editing = null
const button = (label, fn, cls='') => {
  const b = document.createElement('button')
  b.textContent = label
  b.className = cls
  b.onclick = fn
  return b
}
function save(){
  localStorage.setItem('pingboard.tasks', JSON.stringify(tasks))
  render()
}
function edit(task, stage=0){
  editing = task?.id
  form.reset()
  for(const key of ['title','note','due','area','stage'])
    fields[key].value = task?.[key] ?? ({area:filter==='Личное'?filter:'Работа',stage}[key] ?? '')
  el('heading').textContent = task?'Редактировать задачу':'Новая задача'
  el('del').hidden = !task
  el('dlg').showModal()
}
stages.forEach((s,i)=>fields.stage.add(new Option(s,i)))
el('cancel').onclick = ()=>el('dlg').close()
el('del').onclick = ()=>{
  if(confirm('Удалить задачу?')){
    tasks = tasks.filter(t=>t.id!==editing)
    save()
    el('dlg').close()
  }
}
form.onsubmit = e=>{
  e.preventDefault()
  const data = Object.fromEntries(new FormData(form))
  data.title = data.title.trim()
  if(!data.title){fields.title.focus();return}
  const old = tasks.find(t=>t.id===editing)
  const task = {...data,stage:Number(data.stage),id:editing||crypto.randomUUID(),pinged:old?.due===data.due && old?.pinged}
  if(old) Object.assign(old,task)
  else tasks.push(task)
  save()
  el('dlg').close()
}
for(const name of ['Все','Работа','Личное'])
  el('filters').append(button(name,()=>{filter=name;render()}))
const search = document.createElement('input')
search.placeholder='Поиск задач'
search.oninput=()=>{query=search.value.toLowerCase();render()}
el('filters').append(search,button('+ Новая задача',()=>edit(null),'primary'))
function render(){
  Array.from(el('filters').children).slice(0,3).forEach(b=>b.className=b.textContent===filter?'active':'')
  el('board').replaceChildren()
  const visible = tasks.filter(t=>(filter==='Все'||t.area===filter)&&(t.title+' '+t.note).toLowerCase().includes(query))
  stages.forEach((s,i)=>{
    const col=document.createElement('section'), heading=document.createElement('h2')
    const group=visible.filter(t=>t.stage===i).sort((a,b)=>(a.due||'z').localeCompare(b.due||'z'))
    heading.textContent=s
    const count=document.createElement('small')
    count.textContent=group.length
    heading.append(count)
    col.append(heading)
    for(const t of group){
      const card=button('',()=>edit(t),'card')
      const tag=document.createElement('small'),title=document.createElement('strong')
      tag.textContent=t.area
      title.textContent=t.title
      card.append(tag,title)
      if(t.due){const due=document.createElement('small');due.textContent='◷ '+new Date(t.due).toLocaleString('ru',{dateStyle:'short',timeStyle:'short'});card.append(due)}
      col.append(card)
    }
    col.append(button('+ Добавить',()=>edit(null,i),'add'))
    el('board').append(col)
  })
  el('summary').textContent='Активных задач · '+tasks.filter(t=>t.stage!==2).length
  const overdue=tasks.filter(t=>t.stage!==2 && t.due && new Date(t.due)<=new Date())
  el('alert').textContent=overdue.length?'Пора заняться · '+overdue.map(t=>t.title).join(' / '):''
}
function tick(){
  render()
  for(const t of tasks.filter(t=>t.stage!==2 && !t.pinged && new Date(t.due)<=new Date())){
    if(window.Notification && Notification.permission==='granted'){
      new Notification('Пингборд',{body:t.title})
      t.pinged=true
      save()
    }
  }
}
if(window.Notification && Notification.permission==='default')
  el('filters').append(button('Включить уведомления',async e=>{const b=e.currentTarget;await Notification.requestPermission();b.remove();tick()}))
el('date').textContent=new Date().toLocaleDateString('ru',{weekday:'long',day:'numeric',month:'long'})
window.addEventListener('storage',()=>{tasks=JSON.parse(localStorage.getItem('pingboard.tasks')||'[]');render()})
tick()
setInterval(tick,15000)
