// Optional local Chrome smoke check. Uses only a disposable profile and server.
import { createServer } from 'node:http'
import { readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { strict as assert } from 'node:assert'

const root = new URL('../_site/', import.meta.url)
const pages = (await readdir(root)).filter(name => name.endsWith('.html'))
const chromePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const results = []
for (const width of [1280, 390]) {
  const profile = await mkdtemp(join(tmpdir(), 'qr-docs-chrome-'))
  let finish, chrome, timer, socket
  const completed = new Promise(resolve => { finish = resolve })
  const script = `<script>
  (async()=>{try {
    const pages=${JSON.stringify(pages)}, titles=new Set();
    for(const page of pages) {
      const response=await fetch(page); if(!response.ok)throw Error(page+' HTTP '+response.status);
      const doc=new DOMParser().parseFromString(await response.text(),'text/html');
      if(doc.documentElement.lang!=='en-GB'||doc.querySelectorAll('h1').length!==1)throw Error(page+' document structure');
      if(!doc.querySelector('link[rel=canonical]')||!doc.querySelector('meta[name=description]'))throw Error(page+' metadata');
      if(titles.has(doc.title))throw Error('duplicate title');titles.add(doc.title);
      const schema=JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent);
      if(schema.name!=='@forgesworn/qr')throw Error('schema identity');
    }
    if(innerWidth!==${width})throw Error('wrong viewport '+innerWidth);
    if(document.documentElement.scrollWidth>innerWidth+1)throw Error('horizontal page overflow');
    for(const name of ['style.css','icon.svg','llms.txt','llms-full.txt','sitemap.xml'])if(!(await fetch(name)).ok)throw Error('missing '+name);
    const demoFrame=document.createElement('iframe');
    demoFrame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none';
    const loaded=new Promise(resolve=>{demoFrame.onload=resolve});
    demoFrame.src='browser.html';
    document.body.append(demoFrame);
    await loaded;
    const demo=demoFrame.contentDocument;
    if(demo.documentElement.scrollWidth>demoFrame.contentWindow.innerWidth+1)throw Error('demo page overflow');
    const sample=demo.getElementById('qr-demo-sample');
    const generate=demo.getElementById('qr-demo-generate');
    const file=demo.getElementById('qr-demo-file');
    const status=demo.getElementById('qr-demo-status');
    const result=demo.getElementById('qr-demo-result');
    if(sample.disabled||generate.disabled||file.disabled)throw Error('demo controls disabled');
    function waitFor(check) {
      if(check())return Promise.resolve();
      return new Promise(resolve=>{
        const observer=new MutationObserver(()=>{
          if(check()){observer.disconnect();resolve()}
        });
        observer.observe(demo.querySelector('.qr-demo'),{childList:true,subtree:true,attributes:true});
      });
    }
    sample.click();
    await waitFor(()=>!result.hidden&&result.textContent==='https://example.com/c2d');
    generate.click();
    if(result.hidden||result.textContent!=='https://example.com/qr-demo')throw Error('generation round trip failed');
    const blank=demo.createElement('canvas');
    blank.width=blank.height=128;
    const context=blank.getContext('2d');
    context.fillStyle='white';
    context.fillRect(0,0,128,128);
    const png=await new Promise(resolve=>blank.toBlob(resolve));
    const transfer=new DataTransfer();
    transfer.items.add(new File([png],'blank.png',{type:'image/png'}));
    file.files=transfer.files;
    file.dispatchEvent(new demoFrame.contentWindow.Event('change'));
    await waitFor(()=>result.hidden&&status.textContent==='No readable QR code found.');
    demoFrame.remove();
    await fetch('/done',{method:'POST',body:JSON.stringify({ok:true,width:innerWidth,pages:pages.length,title:document.title,demo:'sample, generation and blank upload passed'})});
  }catch(error){await fetch('/done',{method:'POST',body:JSON.stringify({ok:false,error:String(error)})})}})();</script>`
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/done') {
        let body = ''; for await (const part of req) body += part
        res.end('ok'); finish(JSON.parse(body)); return
      }
      const name = req.url === '/' ? 'index.html' : req.url.slice(1)
      if (!/^(?:qr-module\/)?[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(name)) { res.writeHead(404).end(); return }
      let body = await readFile(new URL(name, root))
      const types = { html: 'text/html', css: 'text/css', svg: 'image/svg+xml', txt: 'text/plain', xml: 'application/xml', js: 'text/javascript', png: 'image/png' }
      res.setHeader('content-type', `${types[name.split('.').pop()] ?? 'application/octet-stream'}; charset=utf-8`)
      if (req.url === '/') body = Buffer.from(body.toString().replace('</body>', `${script}</body>`))
      res.end(body)
    } catch { res.writeHead(404).end() }
  })
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const args = ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank']
    chrome = spawn(chromePath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    const failure = new Promise((_, reject) => { chrome.once('error', reject); timer = setTimeout(() => reject(Error('Documentation browser timeout')), 30000) })
    const endpoint = await Promise.race([new Promise(resolve => {
      let stderr = ''
      chrome.stderr.on('data', chunk => { stderr += chunk; const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr); if (match) resolve(match[1]) })
    }), failure])
    socket = new WebSocket(endpoint)
    await Promise.race([new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) }), failure])
    const pending = new Map(); let id = 0
    socket.addEventListener('message', event => { const message = JSON.parse(event.data); const request = pending.get(message.id); if (request) { pending.delete(message.id); message.error ? request.reject(Error(message.error.message)) : request.resolve(message.result) } })
    const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params, ...(sessionId ? { sessionId } : {}) })) })
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 }, sessionId)
    await call('Page.enable', {}, sessionId)
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` }, sessionId)
    const result = await Promise.race([completed, failure])
    assert(result.ok, result.error); results.push(result)
    if (process.env.QR_DOCS_SCREENSHOT_DIR) {
      const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId)
      await writeFile(join(process.env.QR_DOCS_SCREENSHOT_DIR, `docs-${width}.png`), Buffer.from(data, 'base64'))
    }
  } finally {
    clearTimeout(timer)
    socket?.close()
    if (chrome && chrome.exitCode === null) { const closed = new Promise(resolve => chrome.once('close', resolve)); chrome.kill(); await closed }
    await new Promise(resolve => server.close(resolve))
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
console.log(JSON.stringify({ results, browser: chromePath.split('/').pop() }, null, 2))
