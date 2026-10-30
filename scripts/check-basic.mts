// Browser checks of examples/basic: `node --import tsx scripts/check-basic.mts <url>`
import { launch } from './browser.ts'

const base = process.argv[2] ?? 'http://localhost:8000'
const browser = await launch()
const page = await browser.newPage()
const logs: string[] = []
page.on('console', msg => logs.push(`${msg.type()}: ${msg.text()}`))
page.on('pageerror', err => logs.push(`pageerror: ${err.message}`))

// the server-rendered page is complete without JavaScript
const noJs = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
await noJs.goto(`${base}/about`)
console.log('no-js:', await noJs.textContent('#loader'), '| css:', await noJs.evaluate(() => getComputedStyle(document.querySelector('nav')!).display))

await page.goto(`${base}/`)
await page.waitForFunction(() => document.title.startsWith('Cormi ·'))
await page.click('button')
await page.click('button')
console.log('hydrated:', await page.textContent('button'), '| title:', await page.title())
await page.click('text=About')
await page.waitForFunction(() => document.querySelector('#loader')?.textContent?.includes('served'))
console.log('client nav loader:', await page.textContent('#loader'), '| title:', await page.title())
await page.click('text=Users')
await page.waitForSelector('#users li')
await page.click('text=Bob')
await page.waitForSelector('#user')
console.log('users:', await page.textContent('#user'))
console.log('logs:', logs)
await browser.close()
