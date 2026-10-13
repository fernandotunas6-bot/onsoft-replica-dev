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
}], timetable:[{classSubjectId:subject,slotId:other,weekday:2,startsAt:'09:00',endsAt:'10:00',privateField:'secret'}],tasks:[]});
function req(path='',headers={},method='GET') { return new Request(`https://test.example/api/mobile-v4/schools/${school}/classes${path}`,{method,headers:{Authorization:'Bearer token',...headers}}); }
function deps() { return {authenticate:async()=>({userId:'verified',aal:'aal1'}),academicCatalog:async(user,scope)=>{assert.equal(user,'verified');assert.equal(scope.schoolId,school);return catalog();}}; }
test('class list exports only explicit academic fields, no roster or user IDs',async()=>{
 const r=await handleInstitutionalExtension(req('?role=aluno'),deps());assert.equal(r.status,200);
 const text=await r.text();for(const secret of ['private','Other pupil','secret-user','students'])assert.ok(!text.includes(secret));
 assert.equal(r.headers.get('Cache-Control'),'private, no-store');
});
test('class detail filters to authorized subject scope and drops future private fields',async()=>{
 const d=deps();d.academicCatalog=async()=>{const c=catalog();c.classes.push({...c.classes[0],classGroupId:other,classSubjectId:other});c.timetable.push({classSubjectId:other});return c;};
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

const term='55555555-5555-4555-8555-555555555555';
const notice='66666666-6666-4666-8666-666666666666';
const resultSet=()=>({schoolId:school,role:'aluno',studentId:'verified',items:[{
 classSubjectId:subject,termId:term,termName:'1.º Trimestre',publication:'published',scaleMax:20,
 finalGrade:14,status:'APROVADO',grades:[{code:'MAC',label:'MAC',value:13},{code:'NPP',label:'NPP',value:null}],
 teacherComment:'private-comment',studentId:'private',
}]});
const noticeFeed=()=>({schoolId:school,role:'aluno',nextCursor:null,items:[{
 id:notice,title:'Reunião',body:'Convocatória',publishedAt:'2026-10-12T08:00:00Z',
 audience:'school',classSubjectId:null,pinned:true,authorEmail:'secret@example.test',
}]});
function records(path,extra={}) {
 const d=deps(); d.now=()=>new Date('2026-10-13T08:00:00Z');
 d.academicResults=async()=>resultSet(); d.notices=async()=>noticeFeed();
 return [new Request(`https://test.example/api/mobile-v4/schools/${school}/${path}`,{headers:{Authorization:'Bearer token'}}),Object.assign(d,extra)];
}
test('published results are exported with the school scale and no private fields',async()=>{
 const r=await handleInstitutionalExtension(...records('results?role=aluno'));assert.equal(r.status,200);
 const body=await r.json();assert.equal(body.items.length,1);
 assert.equal(body.items[0].subjectName,'Matemática');assert.equal(body.items[0].scaleMax,20);
 assert.equal(body.items[0].grades[1].value,null);
 const text=JSON.stringify(body);for(const secret of ['private-comment','studentId','private'])assert.ok(!text.includes(secret));
});
test('teacher profile has no results contract instead of seeing class marks',async()=>{
 const [,d]=records('results?role=professor');
 d.academicCatalog=async()=>({...catalog(),role:'professor'});
 d.academicResults=async()=>{throw Error('should not run');};
 const request=new Request(`https://test.example/api/mobile-v4/schools/${school}/results?role=professor`,{headers:{Authorization:'Bearer token'}});
 assert.equal((await handleInstitutionalExtension(request,d)).status,403);
});
test('results of another pupil or unpublished marks fail closed',async()=>{
 for(const patch of [{studentId:'other-pupil'},{items:[{...resultSet().items[0],publication:'draft'}]}]) {
  const [request,d]=records('results?role=aluno'); d.academicResults=async()=>({...resultSet(),...patch});
  assert.equal((await handleInstitutionalExtension(request,d)).status,503);
 }
});
test('a grade outside the school scale or a subject outside the catalog is refused',async()=>{
 for(const patch of [{scaleMax:20,finalGrade:34},{classSubjectId:other}]) {
  const [request,d]=records('results?role=aluno');
  d.academicResults=async()=>({...resultSet(),items:[{...resultSet().items[0],...patch}]});
  assert.equal((await handleInstitutionalExtension(request,d)).status,503);
 }
});
test('duplicate terms and duplicate grade codes are rejected',async()=>{
 for(const items of [Array(2).fill(resultSet().items[0]),[{...resultSet().items[0],grades:[{code:'MAC',label:'MAC',value:1},{code:'MAC',label:'MAC',value:2}]}]]) {
  const [request,d]=records('results?role=aluno'); d.academicResults=async()=>({...resultSet(),items});
  assert.equal((await handleInstitutionalExtension(request,d)).status,503);
 }
});
test('notice feed exports the authorized audience and hides author contacts',async()=>{
 const r=await handleInstitutionalExtension(...records('notices?role=aluno'));assert.equal(r.status,200);
 const body=await r.json();assert.equal(body.items[0].title,'Reunião');assert.equal(body.nextCursor,null);
 assert.ok(!JSON.stringify(body).includes('secret@example.test'));
});
test('a scheduled notice never reaches the device before publication',async()=>{
 const [request,d]=records('notices?role=aluno');
 d.notices=async()=>({...noticeFeed(),items:[{...noticeFeed().items[0],publishedAt:'2026-10-14T08:00:00Z'}]});
 assert.equal((await handleInstitutionalExtension(request,d)).status,503);
});
test('a notice for another class is refused rather than filtered silently',async()=>{
 const [request,d]=records('notices?role=aluno');
 d.notices=async()=>({...noticeFeed(),items:[{...noticeFeed().items[0],audience:'class',classSubjectId:other}]});
 assert.equal((await handleInstitutionalExtension(request,d)).status,503);
});
test('cursor is validated and a repeated cursor cannot loop the feed',async()=>{
 const [,d]=records('notices?role=aluno');
 const bad=new Request(`https://test.example/api/mobile-v4/schools/${school}/notices?role=aluno&cursor=../../etc`,{headers:{Authorization:'Bearer token'}});
 assert.equal((await handleInstitutionalExtension(bad,d)).status,422);
 const page=new Request(`https://test.example/api/mobile-v4/schools/${school}/notices?role=aluno&cursor=abc`,{headers:{Authorization:'Bearer token'}});
 d.notices=async(user,scope,cursor)=>{assert.equal(cursor,'abc');return {...noticeFeed(),nextCursor:'abc'};};
 assert.equal((await handleInstitutionalExtension(page,d)).status,503);
});
test('results and notices accept no resource id and no unknown query field',async()=>{
 const [,d]=records('results?role=aluno');
 for(const [path,status] of [[`results/${term}?role=aluno`,404],[`notices/${notice}?role=aluno`,404],['notices?role=aluno&page=2',422],['results?role=aluno&cursor=abc',422]]) {
  const request=new Request(`https://test.example/api/mobile-v4/schools/${school}/${path}`,{headers:{Authorization:'Bearer token'}});
  assert.equal((await handleInstitutionalExtension(request,d)).status,status,path);
 }
});
test('a service that is not mounted does not answer with empty records',async()=>{
 for(const path of ['results?role=aluno','notices?role=aluno']) {
  const request=new Request(`https://test.example/api/mobile-v4/schools/${school}/${path}`,{headers:{Authorization:'Bearer token'}});
  assert.equal((await handleInstitutionalExtension(request,deps())).status,503);
 }
});
