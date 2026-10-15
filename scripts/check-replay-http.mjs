import assert from 'node:assert/strict'
import { replayJson } from '../server/gc/replay-http.mjs'
const url='https://test/replay'
async function scenario(responses, options={}) {
  let calls=0, waits=[]
  const result=await replayJson(url, {method:'POST',body:'same payload'}, {
    ...options, sleep:async ms=>waits.push(ms), fetcher:async (_url, init)=>{
      assert.equal(init.body,'same payload')
      const reply=responses[calls++]
      if(reply instanceof Error)throw reply
      return typeof reply==='function'?reply():Response.json({ok:true},{status:reply})
    },
  }).then(value=>({value}),error=>({error}))
  return {...result,calls,waits}
}
for(const failure of [new DOMException('timeout','TimeoutError'),new TypeError('fetch failed'),429,502,503]) {
  const r=await scenario([failure,200]);assert.deepEqual(r.value,{ok:true});assert.equal(r.calls,2)
}
const bodyTimeout=await scenario([()=>({ok:true,status:200,json:async()=>{throw new DOMException('body timeout','TimeoutError')}}),200])
assert.equal(bodyTimeout.calls,2);assert(bodyTimeout.value.ok)
const exhausted=await scenario([503,503,503]);assert(exhausted.error);assert.equal(exhausted.calls,3);assert.deepEqual(exhausted.waits,[1000,2000])
for(const code of [400,401,403,404]) {const r=await scenario([code]);assert(r.error);assert.equal(r.calls,1)}
const missing=await scenario([404],{allow404:true});assert.equal(missing.value,null);assert.equal(missing.calls,1)
const invalid=await scenario([()=>new Response('invalid json')]);assert(invalid.error);assert.equal(invalid.calls,1)
console.log('PASS replay HTTP: bounded retries, timeout during body, rate limits, idempotent payload, permanent failures and missing metadata')
