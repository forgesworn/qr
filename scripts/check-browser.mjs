import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, loadavg } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
// CHROME=/path/to/chrome node scripts/check-browser.mjs > browser-results.json
// Uses an isolated profile and local HTTP server; both are removed on exit.
const root = process.cwd();
const chromePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const requests = [];
const loadBefore = loadavg();
const wasmSha256 = createHash('sha256').update(await readFile(root + '/dist/qr.wasm')).digest('hex');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const profile = await mkdtemp(join(tmpdir(), 'qr-chrome-'));
const html = `<!doctype html><pre id="result">WAIT</pre><script type="module">
try {
 const {loadWasm,wasmUrl} = await import('/dist/wasm.js');
 const wasm=await loadWasm(await (await fetch(wasmUrl)).arrayBuffer());
 const qr=wasm.encode('https://example.com/browser');
 const canvas=document.createElement('canvas'); canvas.width=canvas.height=(qr.size+8)*5;
 const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='black';
 for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.modules[y*qr.size+x])c.fillRect((x+4)*5,(y+4)*5,5,5);
 const frame=c.getImageData(0,0,canvas.width,canvas.height);
 const found=wasm.decode(frame);
 if(found?.text!=='https://example.com/browser')throw Error('wrong full result');
 const origin=location.origin;
 const workerUrl=URL.createObjectURL(new Blob([\`onmessage=async e=>{try{const {loadWasm,wasmUrl}=await import('\${origin}/dist/wasm.js');const w=await loadWasm(await(await fetch(wasmUrl)).arrayBuffer());const r=w.decode(e.data);w.dispose();postMessage(r.text)}catch(e){postMessage(String(e))}}\`],{type:'text/javascript'}));const worker=new Worker(workerUrl,{type:'module'});
 const workerText=await new Promise(resolve=>{worker.onmessage=e=>resolve(e.data);worker.postMessage(frame)});worker.terminate();URL.revokeObjectURL(workerUrl);
 if(workerText!==found.text)throw Error('worker failed: '+workerText);
 const formats=typeof BarcodeDetector==='undefined'?[]:await BarcodeDetector.getSupportedFormats();
 let native='unavailable';
 if(formats.includes('qr_code')){const result=await new BarcodeDetector({formats:['qr_code']}).detect(canvas);native=result[0]?.rawValue;if(native!==found.text)throw Error('native read differs');}
 const ts=await import('/dist/index.js');
 const {timingFrames,summary}=await import('/scripts/comparison-fixtures.mjs');
 const detector=formats.includes('qr_code')?new BarcodeDetector({formats:['qr_code']}):undefined;
 const readers={typescript:f=>ts.decode(f),wasm:f=>wasm.decode(f),...(detector?{native:f=>detector.detect(new ImageData(f.data,f.width,f.height))}:{})};
 const timings=[];
 for(const f of timingFrames(ts.encode)){
   const samples=Object.fromEntries(Object.keys(readers).map(n=>[n,[]]));
   for(let round=-5;round<25;round++){
     const names=Object.keys(readers),offset=(round+5)%names.length;
     for(const name of [...names.slice(offset),...names.slice(0,offset)]){
       const start=performance.now(),r=await readers[name](f),elapsed=performance.now()-start;
       const actual=name==='native'?r[0]?.rawValue:r?.text;
       if(actual!==f.expected)throw Error(f.name+'/'+name+' wrong result');
       if(round>=0)samples[name].push(elapsed);
     }
   }
   timings.push({name:f.name,...Object.fromEntries(Object.entries(samples).map(([n,v])=>[n,summary(v)]))});
 }
 wasm.reset();wasm.dispose();
 document.querySelector('#result').textContent='PASS '+JSON.stringify({userAgent:navigator.userAgent,worker:true,native,formats,rounds:25,warmup:5,timings});
}catch(e){document.querySelector('#result').textContent='FAIL '+e.stack}
await fetch('/done',{method:'POST',body:document.querySelector('#result').textContent});
</script>`;
let finish;const completed=new Promise(resolve=>finish=resolve);let chrome;let timer;let closed;
const server=createServer(async(req,res)=>{requests.push(req.url);try{if(req.url==='/done'){let body='';for await(const part of req)body+=part;res.end('ok');finish(body)}else if(req.url==='/'){res.setHeader('content-type','text/html');res.end(html)}else if((/^\/dist\/[\w.-]+$/.test(req.url)||req.url==='/scripts/comparison-fixtures.mjs')){res.setHeader('content-type',req.url.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(await readFile(root+req.url))}else{res.statusCode=404;res.end()}}catch(e){res.statusCode=500;res.end(String(e))}});
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 chrome=spawn(chromePath,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--user-data-dir='+profile,'http://127.0.0.1:'+server.address().port],{stdio:'ignore'});
 closed=new Promise(resolve=>chrome.once('close',resolve));
 const failed=new Promise((_,reject)=>{chrome.once('error',reject);chrome.once('exit',code=>reject(Error('Chrome exited before completion: '+code)))});
 const result=await Promise.race([completed,failed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),120000)})]);
 if(result.startsWith('PASS '))console.log(JSON.stringify({...JSON.parse(result.slice(5)),revision,wasmSha256,loadBefore,loadAfter:loadavg(),requests},null,2));else console.error(result);
 if(!result.startsWith('PASS '))throw Error('Browser smoke failed');
 // The worker completes before the benchmark imports the TypeScript entry.
 const firstIndex=requests.indexOf('/dist/index.js');
 if(requests.slice(0,firstIndex).includes('/dist/decode.js'))throw Error('WASM entry imported full TS core');
}finally{clearTimeout(timer);if(chrome){chrome.kill();await closed}await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
