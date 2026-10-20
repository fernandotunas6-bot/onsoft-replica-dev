import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSigaWebsiteClient} from '../integration/client.mjs';
const program='11111111-1111-4111-8111-111111111111';
const config={apiOrigin:'https://api.example',campaignSlug:'ispab-campaign',portalUrl:'https://ispab.example/auth'};
const school={apiVersion:1,school:{name:'ISPAB'},campaign:{slug:config.campaignSlug,isOpen:true},programs:[{id:program,name:'Real course'}]};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
test('public school client uses exact configured scope and no cookies',async()=>{
 const calls=[];const client=createSigaWebsiteClient(config,{fetchImpl:async(url,options)=>{calls.push({url,options});return response(school)}});
 assert.deepEqual(await client.getSchool(),school);assert.equal(calls[0].url,'https://api.example/api/public/school-website/ispab-campaign');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');assert.equal(client.getPortalUrl(),config.portalUrl);
});
test('application is sent once, only after refreshing the actual campaign',async()=>{
 const calls=[];const client=createSigaWebsiteClient(config,{fetchImpl:async(url,o)=>{calls.push(o);return response(o.method==='GET'?school:{ok:true,processNumber:'CAND-20261020-ABC123'},o.method==='GET'?200:201)}});
 const result=await client.submitApplication({person:{full_name:'Ana Example'},desiredProgramId:program});assert.equal(result.processNumber,'CAND-20261020-ABC123');assert.deepEqual(calls.map(x=>x.method),['GET','POST']);assert.equal(JSON.parse(calls[1].body).slug,config.campaignSlug);
});
test('demo and foreign-school program IDs are never submitted',async()=>{
 let writes=0;const client=createSigaWebsiteClient(config,{fetchImpl:async(url,o)=>{if(o.method==='POST')writes++;return response(school)}});
 await assert.rejects(()=>client.submitApplication({person:{full_name:'Ana Example'},desiredProgramId:'engenharia-informatica'}),{code:'program_unavailable'});assert.equal(writes,0);
});
test('a different returned campaign is rejected, without a fallback',async()=>{
 const client=createSigaWebsiteClient(config,{fetchImpl:async()=>response({...school,campaign:{slug:'other',isOpen:true}})});await assert.rejects(()=>client.getSchool(),{code:'invalid_response'});
});
test('a failed POST has unknown status and is never automatically retried',async()=>{
 let writes=0;const client=createSigaWebsiteClient(config,{fetchImpl:async(url,o)=>{if(o.method==='POST'){writes++;throw Error('network')};return response(school)}});
 await assert.rejects(()=>client.submitApplication({person:{full_name:'Ana Example'},desiredProgramId:program}),{code:'submission_unknown'});assert.equal(writes,1);
});
test('invalid origins, injected scope and upstream errors fail closed',async()=>{
 for(const value of ['http://api.example','https://user:password@api.example','javascript:alert(1)','https://api.example/path'])assert.throws(()=>createSigaWebsiteClient({...config,apiOrigin:value}),{code:'invalid_configuration'});
 const client=createSigaWebsiteClient(config,{fetchImpl:async()=>response(school)});await assert.rejects(()=>client.submitApplication({person:{full_name:'Ana Example'},school_id:'other'}),{code:'scope_mismatch'});
 const unavailable=createSigaWebsiteClient(config,{fetchImpl:async()=>response({error:'campaign_unavailable'},503)});await assert.rejects(()=>unavailable.getSchool(),{code:'campaign_unavailable',status:503});
});

test('timeout also covers reading the response body',async()=>{
 const client=createSigaWebsiteClient(config,{timeoutMs:10,fetchImpl:async(url,options)=>({ok:true,status:200,json:()=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))))})});
 await assert.rejects(()=>client.getSchool(),{code:'service_unavailable'});
});
