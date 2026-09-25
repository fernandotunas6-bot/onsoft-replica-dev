import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { Building2,GraduationCap,ShieldCheck,ArrowRight,Search,Send,CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { listAvailableSchools,listMySchoolAccessRequests,submitSchoolAccessRequest } from "@/features/access/institutional-requests.server";
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
 const [nationalId,setNationalId]=useState("");
 const [institutionalId,setInstitutionalId]=useState("");
 const [requestedRole,setRequestedRole]=useState<"student"|"teacher"|"guardian"|"user">("student");
 const [busy,setBusy]=useState(false);
 const schools=useQuery({queryKey:["institutional","schools"],queryFn:()=>listAvailableSchools(),enabled:mode==="join"});
 const requests=useQuery({queryKey:["institutional","mine"],queryFn:()=>listMySchoolAccessRequests()});
 const filtered=(schools.data??[]).filter(s=>[s.name,s.public_code,s.province].some(v=>String(v??"").toLowerCase().includes(search.toLowerCase())));
 if(account.profile.isPending)return <main className="min-h-screen grid place-items-center">A confirmar a sua conta…</main>;
 if(account.schoolId)return <main className="min-h-screen grid place-items-center p-6"><div className="rounded-3xl border bg-card p-8 text-center"><CheckCircle2 className="mx-auto size-10 text-green-600"/><h1 className="mt-3 text-xl font-bold">Escola confirmada</h1><Button className="mt-4" onClick={()=>void navigate({to:"/"})}>Abrir o meu painel</Button></div></main>;
 const send=async(e:React.FormEvent)=>{
  e.preventDefault();setBusy(true);
  try{
   const result=await submitSchoolAccessRequest({data:{schoolId,fullName,nationalId,institutionalId,requestedRole}});
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
    <p className="mt-3 max-w-2xl text-slate-600">A sua conta está autenticada, mas ainda não tem uma escola activa. Configure uma instituição ou peça acesso à secretaria da sua escola.</p>
    {mode==="choose"?<div className="mt-9 grid gap-4 md:grid-cols-2">
     <a href="/criar-escola" className="group rounded-3xl border border-blue-100 bg-blue-50/80 p-7 transition hover:-translate-y-1 hover:shadow-lg">
      <Building2 className="mb-5 size-11 text-blue-700"/><h2 className="text-xl font-bold">Quero configurar uma escola</h2>
      <p className="mt-2 text-sm text-slate-600">Registe a instituição no portal oficial e configure os dados administrativos.</p>
      <span className="mt-6 inline-flex items-center gap-2 font-semibold text-blue-700">Configurar escola <ArrowRight size={17}/></span>
     </a>
     <button type="button" onClick={()=>setMode("join")} className="group rounded-3xl border border-emerald-100 bg-emerald-50/80 p-7 text-left transition hover:-translate-y-1 hover:shadow-lg">
      <ShieldCheck className="mb-5 size-11 text-emerald-700"/><h2 className="text-xl font-bold">Já pertenço a uma escola</h2>
      <p className="mt-2 text-sm text-slate-600">Identifique-se, seleccione a sua escola e envie uma solicitação de acesso.</p>
      <span className="mt-6 inline-flex items-center gap-2 font-semibold text-emerald-700">Solicitar acesso <ArrowRight size={17}/></span>
     </button>
    </div>:<form onSubmit={send} className="mt-8 space-y-5">
     <button type="button" onClick={()=>setMode("choose")} className="text-sm font-semibold text-blue-700">← Voltar às opções</button>
     <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Nome completo<Input required minLength={3} maxLength={160} value={fullName} onChange={e=>setFullName(e.target.value)} className="mt-2 rounded-xl" autoComplete="name"/></label>
      <label className="text-sm font-medium">Perfil pretendido<select className="mt-2 h-10 w-full rounded-xl border bg-background px-3" value={requestedRole} onChange={e=>setRequestedRole(e.target.value as typeof requestedRole)}><option value="student">Aluno</option><option value="teacher">Professor</option><option value="guardian">Encarregado</option><option value="user">Funcionário / outro</option></select></label>
      <label className="text-sm font-medium">B.I. (quando aplicável)<Input maxLength={30} value={nationalId} onChange={e=>setNationalId(e.target.value)} className="mt-2 rounded-xl"/></label>
      <label className="text-sm font-medium">Número escolar ou funcional<Input maxLength={40} value={institutionalId} onChange={e=>setInstitutionalId(e.target.value)} className="mt-2 rounded-xl"/></label>
     </div>
     <div className="border-t pt-6"><label className="text-sm font-semibold">Seleccione a escola</label><div className="relative mt-2"><Search className="absolute left-3 top-3 size-4 text-slate-400"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar por nome, código ou província" className="rounded-xl pl-9"/></div>
      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">{schools.isLoading?<p className="text-sm text-slate-500">A carregar escolas…</p>:filtered.map(s=><button type="button" key={s.id} onClick={()=>setSchoolId(s.id)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm ${schoolId===s.id?"border-blue-600 bg-blue-50":"hover:bg-slate-50"}`}><span><b>{s.name}</b><small className="block text-slate-500">{[s.public_code,s.province].filter(Boolean).join(" · ")}</small></span>{schoolId===s.id?<CheckCircle2 className="text-blue-700"/>:null}</button>)}</div>
     </div>
     <p className="text-xs text-slate-500">O envio não concede acesso imediato. A secretaria confirmará os seus dados e o vínculo institucional.</p>
     <Button disabled={busy||!schoolId||!fullName.trim()||!(nationalId.trim()||institutionalId.trim())} className="w-full rounded-xl"><Send className="mr-2 size-4"/>{busy?"A enviar…":"Enviar solicitação à secretaria"}</Button>
    </form>}
   </section>
   {(requests.data??[]).length>0?<section className="mt-6 rounded-3xl border bg-white p-6"><h2 className="font-bold">As minhas solicitações</h2><div className="mt-3 space-y-2">{(requests.data??[]).map(r=><div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm"><span>{(r.schools as unknown as {name?:string}|null)?.name??"Escola"}<small className="block text-slate-500">{r.requested_role}</small></span><span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-700">{r.status}</span></div>)}</div></section>:null}
  </div>
 </main>;
}
