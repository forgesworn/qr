import {framesFor} from './frames-holdout.mjs'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const [rivals,out]=process.argv.slice(2),frames=framesFor(rivals),sha=x=>createHash('sha256').update(x).digest('hex')
if(new Set(frames.map(f=>f.meta.pixelSha256)).size!==128)throw Error('Duplicate pixels')
writeFileSync(out,JSON.stringify({baseline:'268fa8291e7ba47d93bbccf00a828d69e5a80dc5',encoder:'qrcode@1.5.4',generatorSha256:sha(readFileSync(new URL('./frames-holdout.mjs',import.meta.url))),frozenAt:new Date().toISOString(),frozenBeforeDecoderEvaluation:true,cases:frames.map(f=>f.meta)},null,2)+'\n',{flag:'wx'})
console.log('Frozen128 unique holdout inputs; no decoder imported or evaluated')
