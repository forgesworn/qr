import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {verifyProductionIdentity} from './verify-production-identity.mjs'
const [root,build,prototype,out]=process.argv.slice(2)
if(!out)throw Error('Usage: node verify-build.mjs ROOT BUILD QUALIFIED_PROTOTYPE_BUILD NEW_OUTPUT')
const proof=await verifyProductionIdentity(root,build,prototype)
const sha=b=>createHash('sha256').update(b).digest('hex')
writeFileSync(out,JSON.stringify({passed:true,baseline:proof.identity.revision,sources:proof.identity.sources,
 javascript:proof.identity.generated,wasm:proof.wasm,binding:proof,runnerSha256:sha(readFileSync(new URL(import.meta.url)))},null,2)+'\n',{flag:'wx'})
