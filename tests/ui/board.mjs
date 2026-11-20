import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'

test('Создание, поиск, перенос, Сегодня и восстановление доски', async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH})
  t.after(()=>browser.close())
  const page=await browser.newPage()
  await page.goto(new URL('../../dist/index.html',import.meta.url).href)
  const button=name=>page.getByRole('button',{name,exact:true})
  await button('Канбан').click()
  const palette=button('Добавить стикер: Лимон')
  await palette.dragTo(page.locator('section').first())
  const empty=page.locator('.card').filter({hasText:'Пустой стикер'})
  await empty.waitFor()
  assert.equal(await page.locator('.sticker-panel').count(),0)
  await empty.dblclick()
  await button('Изменить').click()
  await page.getByText('Детали',{exact:true}).click()
  await page.getByLabel('Задача',{exact:true}).fill('Проверить отчёт')
  await page.getByLabel('Метки через запятую').fill('ревью')
  await page.getByLabel('Напомнить в').fill('2020-01-01T10:00')
  await button('Сохранить').click()
  const search=page.getByLabel('Поиск задач')
  await search.fill('бюджет')
  assert.equal(await page.locator('.card').count(),0)
  await search.fill('ревью')
  const card=page.locator('.card')
  await card.dragTo(page.locator('section').nth(1))
  await page.locator('section').nth(1).locator('.card').waitFor()
  await button('Работа').click()
  await button('Сегодня').click()
  await page.reload()
  await page.getByRole('heading',{name:'Сегодня.',exact:true}).waitFor()
  assert.equal(await button('Работа').getAttribute('class'),'active')
  await page.locator('section').first().locator('.card').waitFor()
  await button('Канбан').click()
  await page.locator('section').nth(1).locator('.card').dragTo(page.locator('section').nth(2))
  await page.locator('section').nth(2).locator('.card').waitFor()
  await button('Сегодня').click()
  assert.equal(await card.count(),0)

  await button('Доска').click()
  await page.locator('.backup-menu summary').click()
  const download=page.waitForEvent('download')
  await button('Сохранить копию').click()
  assert.match((await download).suggestedFilename(),/^Pingboard-.*\.json$/)
  const restored={
    version:1,
    tasks:[{id:'restored',title:'Восстановленный стикер',note:'',due:'',area:'Работа',stage:0}],
    settings:{view:'Доска',filter:'Все',surface:'Мята',camera:{x:24,y:36,zoom:1.2}}
  }
  page.once('dialog',dialog=>dialog.accept())
  const recovery=page.waitForEvent('download')
  await page.locator('input[type="file"]').setInputFiles({
    name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(restored))
  })
  await recovery
  await page.locator('.sticky').filter({hasText:'Восстановленный стикер'}).waitFor()
  assert.equal(await page.locator('.pinboard-plane').evaluate(el=>el.style.transform),'translate(24px, 36px) scale(1.2)')
})
