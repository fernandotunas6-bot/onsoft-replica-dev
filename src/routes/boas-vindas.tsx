import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState,type FormEvent } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { Building2,GraduationCap,ShieldCheck,ArrowRight,Search,Send,CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { listAvailableSchools,listMySchoolAccessRequests,submitSchoolAccessRequest,getApprovedEnrollmentForm,getMyInstitutionalCredentials } from "@/features/access/institutional-requests.server";
import { toast } from "sonner";

export const Route=createFileRoute("/boas-vindas")({component:InstitutionalWelcome});
function InstitutionalWelcome(){
 const account=useCurrentAccount();
 const navigate=useNavigate();
 const client=useQueryClient();
 const [mode,setMode]=useState<"choose"|"join">("choose");
 const [search,setSearch]=useState("");
 const [schoolId,setSchoolId]=useState("");
 const [fullName,setFullName]=useState("");
 const [requestedRole,setRequestedRole]=useState<"student"|"teacher"|"guardian"|"user">("student");
 const [busy,setBusy]=useState(false);
 const credentials=useQuery({queryKey:["institutional","credentials",account.schoolId],queryFn:()=>getMyInstitutionalCredentials(),enabled:Boolean(account.schoolId)});
 const [openingEnrollment,setOpeningEnrollment]=useState<string|null>(null);
 const startEnrollment=async(requestId:string)=>{
   setOpeningEnrollment(requestId);
   try{
    const form=await getApprovedEnrollmentForm({data:{requestId}});
    window.location.assign(`/matricula/${encodeURIComponent(form.slug)}?accessRequestId=${encodeURIComponent(requestId)}`);
   }catch(error){toast.error(error instanceof Error?error.message:"A matrícula ainda não está disponível.");}
   finally{setOpeningEnrollment(null);}
 };
 const schools=useQuery({queryKey:["institutional","schools"],queryFn:()=>listAvailableSchools(),enabled:mode==="join"});
 const requests=useQuery({queryKey:["institutional","mine"],queryFn:()=>listMySchoolAccessRequests()});
 const filtered=(schools.data??[]).filter(s=>[s.name,s.public_code,s.province].some(v=>String(v??"").toLowerCase().includes(search.toLowerCase())));
 if(account.profile.isPending)return <main className="min-h-screen grid place-items-center">A confirmar a sua conta…</main>;
 if(account.schoolId)return <main className="grid min-h-screen place-items-center bg-gradient-to-br from-blue-50 to-slate-100 p-6"><section className="w-full max-w-lg rounded-3xl border bg-white p-8 shadow-xl">
  <CheckCircle2 className="size-12 text-emerald-600"/><h1 className="mt-4 text-3xl font-extrabold">Escola confirmada</h1>
  <p className="mt-2 text-sm text-slate-600">O vínculo institucional está activo. Use os dados abaixo para os próximos acessos.</p>
  {credentials.data?<dl className="mt-6 space-y-3 rounded-2xl bg-blue-50 p-5 text-sm">
   <div><dt className="text-slate-500">Escola</dt><dd className="font-semibold">{credentials.data.schoolName}</dd></div>
   <div><dt className="text-slate-500">Código institucional</dt><dd className="font-semibold">{credentials.data.schoolCode??"Consulte a secretaria"}</dd></div>
   <div><dt className="text-slate-500">Número de estudante</dt><dd className="font-semibold">{credentials.data.studentNumber}</dd></div>
   {credentials.data.biMasked?<div><dt className="text-slate-500">B.I. associado</dt><dd className="font-semibold">{credentials.data.biMasked}</dd></div>:null}
   <p className="border-t border-blue-200 pt-3 text-xs text-slate-600">{credentials.data.passwordInstruction} Por segurança, nenhuma senha é enviada em texto simples.</p>
  </dl>:null}
  <Button className="mt-6 w-full rounded-xl" onClick={()=>void navigate({to:"/"})}>Abrir o meu painel</Button>
 </section></main>;
 const send=async(e:FormEvent)=>{
  e.preventDefault();setBusy(true);
  try{
   const result=await submitSchoolAccessRequest({data:{schoolId,fullName,requestedRole}});
   toast.success(result.alreadyExists?"Já tem uma solicitação pendente.":"Solicitação enviada à secretaria.");
   await client.invalidateQueries({queryKey:["institutional","mine"]});
   setMode("choose");
  }catch(error){toast.error(error instanceof Error?error.message:"Não foi possível enviar a solicitação.");}
  finally{setBusy(false);}
 };
 return <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-slate-100 px-4 py-10 text-slate-900">
  <div className="mx-auto max-w-4xl">
   <div className="mb-9 flex items-center justify-between"><div className="flex items-center gap-3 text-xl font-bold"><span className="grid size-11 place-items-center rounded-2xl bg-blue-700 text-white"><GraduationCap/></span>SIGA Plus</div><Link to="/perfil" className="text-sm text-slate-600 hover:text-blue-700">A minha conta</Link></div>
   <section className="rounded-[2rem] border border-white bg-white/90 p-6 shadow-xl shadow-blue-900/5 sm:p-10">
    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">IDENTIDADE INSTITUCIONAL</span>
    <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Bem-vindo ao SIGA Plus</h1>
    <p className="mt-3 max-w-2xl text-slate-600">A sua identidade está criada. Escolha a escola e aguarde a autorização da secretaria; só depois preencherá o cadastro e a candidatura de matrícula.</p>
    {mode==="choose"?<div className="mt-9 grid gap-4 md:grid-cols-2">
     <a href="/criar-escola" className="group rounded-3xl border border-blue-100 bg-blue-50/80 p-7 transition hover:-translate-y-1 hover:shadow-lg">
      <Building2 className="mb-5 size-11 text-blue-700"/><h2 className="text-xl font-bold">Quero configurar uma escola</h2>
      <p className="mt-2 text-sm text-slate-600">Registe a instituição no portal oficial e configure os dados administrativos.</p>
      <span className="mt-6 inline-flex items-center gap-2 font-semibold text-blue-700">Configurar escola <ArrowRight size={17}/></span>
     </a>
     <button type="button" onClick={()=>setMode("join")} className="group rounded-3xl border border-emerald-100 bg-emerald-50/80 p-7 text-left transition hover:-translate-y-1 hover:shadow-lg">
      <ShieldCheck className="mb-5 size-11 text-emerald-700"/><h2 className="text-xl font-bold">Já pertenço a uma escola</h2>
      <p className="mt-2 text-sm text-slate-600">Seleccione a escola e indique o seu perfil. A secretaria autorizará o cadastro antes de lhe pedir o B.I. e os restantes documentos.</p>
      <span className="mt-6 inline-flex items-center gap-2 font-semibold text-emerald-700">Solicitar acesso <ArrowRight size={17}/></span>
     </button>
    </div>:<form onSubmit={send} className="mt-8 space-y-5">
     <button type="button" onClick={()=>setMode("choose")} className="text-sm font-semibold text-blue-700">← Voltar às opções</button>
     <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Nome completo<Input required minLength={3} maxLength={160} value={fullName} onChange={e=>setFullName(e.target.value)} className="mt-2 rounded-xl" autoComplete="name"/></label>
      <label className="text-sm font-medium">Perfil pretendido<select className="mt-2 h-10 w-full rounded-xl border bg-background px-3" value={requestedRole} onChange={e=>setRequestedRole(e.target.value as typeof requestedRole)}><option value="student">Aluno</option><option value="teacher">Professor</option><option value="guardian">Encarregado</option><option value="user">Funcionário / outro</option></select></label>

     </div>
     <div className="border-t pt-6"><label className="text-sm font-semibold">Seleccione a escola</label><div className="relative mt-2"><Search className="absolute left-3 top-3 size-4 text-slate-400"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar por nome, código ou província" className="rounded-xl pl-9"/></div>
      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">{schools.isLoading?<p className="text-sm text-slate-500">A carregar escolas…</p>:filtered.map(s=><button type="button" key={s.id} onClick={()=>setSchoolId(s.id)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm ${schoolId===s.id?"border-blue-600 bg-blue-50":"hover:bg-slate-50"}`}><span><b>{s.name}</b><small className="block text-slate-500">{[s.public_code,s.province].filter(Boolean).join(" · ")}</small></span>{schoolId===s.id?<CheckCircle2 className="text-blue-700"/>:null}</button>)}</div>
     </div>
     <p className="text-xs text-slate-500">Nesta primeira etapa não pedimos o B.I. nem os documentos. Após a autorização da secretaria, poderá completar o cadastro e a matrícula.</p>
     <Button disabled={busy||!schoolId||!fullName.trim()} className="w-full rounded-xl"><Send className="mr-2 size-4"/>{busy?"A enviar…":"Enviar solicitação à secretaria"}</Button>
    </form>}
   </section>
   {(requests.data??[]).length>0?<section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
     <h2 className="text-lg font-bold">O meu percurso institucional</h2>
     <p className="mt-1 text-sm text-slate-500">Acompanhe cada etapa. O acesso escolar só será activado após a confirmação final.</p>
     <div className="mt-4 space-y-3">{(requests.data??[]).map(r=>{
       const stage=r.status==="preapproved"?(r.requested_role==="student"?2:1):r.status==="enrollment_pending"?3:r.status==="enrollment_rejected"?2:r.status==="rejected"?0:r.status==="cancelled"?0:r.status==="pending"?1:r.status==="under_review"?1:r.status==="needs_information"?1:4;
       const stages=["Escola seleccionada","Revisão inicial","Cadastro completo","Confirmação da matrícula","Credenciais activadas"];
       return <article key={r.id} className="rounded-2xl border border-slate-200 p-5">
         <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold">{(r.schools as unknown as {name?:string}|null)?.name??"Escola"}</h3><p className="text-xs text-slate-500">{r.requested_role==="student"?"Candidato a aluno":r.requested_role==="teacher"?"Docente":r.requested_role==="guardian"?"Encarregado":"Funcionário / outro"}</p></div><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">{r.status==="pending"?"A aguardar secretaria":r.status==="preapproved"?"Autorizado para cadastro":r.status==="approved"?"Credenciais activadas":r.status==="enrollment_pending"?"Matrícula em análise":r.status==="enrollment_rejected"?"Candidatura rejeitada":r.status==="needs_information"?"Informações solicitadas":r.status==="rejected"?"Pedido recusado":r.status==="cancelled"?"Cancelado":r.status==="under_review"?"Em análise":"Acesso confirmado"}</span></div>
         <ol className="grid gap-2 sm:grid-cols-5">{stages.map((label,i)=><li key={label} className={`rounded-xl p-3 text-xs ${i<=stage?"bg-blue-50 text-blue-800":"bg-slate-50 text-slate-400"}`}><span className="mb-2 block font-bold">{i<stage?"✓":i===stage?"●":"○"}</span>{label}</li>)}</ol>
         {r.status==="preapproved"&&r.requested_role==="student"?<Button onClick={()=>void startEnrollment(r.id)} disabled={openingEnrollment===r.id} className="mt-4 rounded-xl">{openingEnrollment===r.id?"A abrir matrícula…":"Completar cadastro e matrícula"}</Button>:null}
         {r.status==="preapproved"&&r.requested_role!=="student"?<p className="mt-4 text-sm text-slate-600">A secretaria autorizou o seu pedido. O cadastro profissional ou familiar será conduzido pela instituição, conforme o seu perfil.</p>:null}
         {r.status==="enrollment_pending"?<p className="mt-4 text-sm text-slate-600">A sua candidatura foi enviada. A secretaria verificará os documentos e confirmará a matrícula antes de activar o portal escolar.</p>:null}
         {r.review_note?<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Secretaria: {r.review_note}</p>:null}
       </article>;
     })}</div>
   </section>:null}
  </div>
 </main>;
}
