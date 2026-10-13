import test from 'node:test';
import assert from 'node:assert/strict';
import { handleInstitutionalExtension, ApiFailure } from './api.ts';
const school='11111111-1111-4111-8111-111111111111';
const group='22222222-2222-4222-8222-222222222222';
const subject='33333333-3333-4333-8333-333333333333';
const other='44444444-4444-4444-8444-444444444444';
const catalog=()=>({schoolId:school,role:'aluno',classes:[{
 classGroupId:group,classSubjectId:subject,academicYearId:other,className:'10.ª A',subjectId:subject,subjectName:'Matemática',
 teacher:{name:'Docente',userId:'secret-user'},students:[{name:'Other pupil',userId:'private'}],privateField:'hidden',
}], timetable:[{classSubjectId:subject,slotId:other,weekday:2,startsAt:'09:00',endsAt:'10:00',publication:'published',room:null,privateField:'secret'}],tasks:[]});
function req(path='',headers={},method='GET') { return new Request(`https://test.example/api/mobile-v4/schools/${school}/classes${path}`,{method,headers:{Authorization:'Bearer token',...headers}}); }
function deps() { return {authenticate:async()=>({userId:'verified',aal:'aal1'}),academicCatalog:async(user,scope)=>{assert.equal(user,'verified');assert.equal(scope.schoolId,school);return catalog();}}; }
test('class list exports only explicit academic fields, no roster or user IDs',async()=>{
 const r=await handleInstitutionalExtension(req('?role=aluno'),deps());assert.equal(r.status,200);
 const text=await r.text();for(const secret of ['private','Other pupil','secret-user','students'])assert.ok(!text.includes(secret));
 assert.equal(r.headers.get('Cache-Control'),'private, no-store');
});
test('class detail filters to authorized subject scope and drops future private fields',async()=>{
 const d=deps();d.academicCatalog=async()=>{const c=catalog();c.classes.push({...c.classes[0],classGroupId:other,classSubjectId:other});c.timetable.push({...c.timetable[0],slotId:subject,classSubjectId:other});return c;};
 const r=await handleInstitutionalExtension(req(`/${group}?role=aluno`),d);assert.equal(r.status,200);
 const body=await r.json();assert.equal(body.item.timetable.length,1);assert.ok(!JSON.stringify(body).includes('privateField'));
});
test('never resolves an absent or unauthorized class outside authorized catalog',async()=>{
 const r=await handleInstitutionalExtension(req(`/${other}?role=aluno`),deps());assert.equal(r.status,404);
});
test('cross origin refused before authentication and data',async()=>{
 const d={authenticate:async()=>{throw Error('should not run');},academicCatalog:async()=>{throw Error('should not run');}};
 assert.equal((await handleInstitutionalExtension(req('?role=aluno',{Origin:'https://evil.test'}),d)).status,403);
});
test('invalid token refuses data lookup',async()=>{
 const d=deps();d.authenticate=async()=>{throw Error('bad token');};d.academicCatalog=async()=>{throw Error('should not run');};
 assert.equal((await handleInstitutionalExtension(req('?role=aluno'),d)).status,401);
});
test('membership denial propagated without internal details',async()=>{
 const d=deps();d.academicCatalog=async()=>{throw new ApiFailure(403,'SCHOOL_FORBIDDEN');};
 assert.equal((await handleInstitutionalExtension(req('?role=aluno'),d)).status,403);
});
test('a catalog for a different school is rejected',async()=>{
 const d=deps();d.academicCatalog=async()=>({...catalog(),schoolId:other});
 assert.equal((await handleInstitutionalExtension(req('?role=aluno'),d)).status,503);
});
test('unknown fields, duplicate roles and unsupported profile rejected',async()=>{
 for(const path of ['?role=aluno&userId=attacker','?role=aluno&role=professor','?role=admin'])
  assert.equal((await handleInstitutionalExtension(req(path),deps())).status,422);
});
test('writes are not accepted even with aal2',async()=>{
 assert.equal((await handleInstitutionalExtension(req('?role=aluno',{},'POST'),deps())).status,405);
});
test('internal exceptions do not disclose secrets',async()=>{
 const d=deps();d.academicCatalog=async()=>{throw Error('db-password');};
 const r=await handleInstitutionalExtension(req('?role=aluno'),d);assert.equal(r.status,503);assert.ok(!(await r.text()).includes('db-password'));
});

test('task endpoints reuse authorized catalog and never export extra private fields',async()=>{
 const d=deps(); d.academicCatalog=async()=>({...catalog(),tasks:[{id:other,classSubjectId:subject,kind:'assignment',title:'Trabalho',instructions:'Resolver',due:null,privateFeedback:'secret-feedback'}]});
 const request=new Request(`https://test.example/api/mobile-v4/schools/${school}/tasks/${other}?role=aluno`,{headers:{Authorization:'Bearer token'}});
 const r=await handleInstitutionalExtension(request,d);assert.equal(r.status,200);
 const text=await r.text();assert.ok(text.includes('Trabalho'));assert.ok(!text.includes('secret-feedback'));
});
test('unavailable task does not reveal existence outside scope',async()=>{
 const request=new Request(`https://test.example/api/mobile-v4/schools/${school}/tasks/${other}?role=aluno`,{headers:{Authorization:'Bearer token'}});
 assert.equal((await handleInstitutionalExtension(request,deps())).status,404);
});
test('malformed teacher fields fail closed rather than exporting nested values',async()=>{
 const d=deps(); d.academicCatalog=async()=>{const c=catalog();c.classes[0].teacher.name={secret:'value'};return c;};
 assert.equal((await handleInstitutionalExtension(req('?role=aluno'),d)).status,503);
});
test('duplicate tasks are rejected',async()=>{
 const d=deps();d.academicCatalog=async()=>({...catalog(),tasks:Array(2).fill({id:other,classSubjectId:subject,kind:'assignment',title:'Task',due:null})});
 assert.equal((await handleInstitutionalExtension(req('?role=aluno'),d)).status,503);
});

test('invalid or repeated timetable rows never reach class output',async()=>{
 for(const change of [{weekday:8},{startsAt:'25:00'},{endsAt:'08:00'},{room:{private:'value'}}]) {
  const d=deps();d.academicCatalog=async()=>{const c=catalog();Object.assign(c.timetable[0],change);return c;};
  assert.equal((await handleInstitutionalExtension(req('?role=aluno'),d)).status,503);
 }
 const d=deps();d.academicCatalog=async()=>{const c=catalog();c.timetable.push(c.timetable[0]);return c;};
 assert.equal((await handleInstitutionalExtension(req('?role=aluno'),d)).status,503);
});
