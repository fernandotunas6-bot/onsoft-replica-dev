import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2,ClipboardList,Search,ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listSchoolAccessRequests,listMatchingPeopleForAccessRequest,reviewSchoolAccessRequest } from "@/features/access/institutional-requests.server";

const labels:Record<string,string>={pending:"Pendente",under_review:"Em análise",needs_information:"Informações necessárias",approved:"Aprovado",rejected:"Rejeitado",cancelled:"Cancelado"};
export function InstitutionalAccessRequestsPanel(){
 const client=useQueryClient();
 const [selected,setSelected]=useState<string|null>(null);
 const [personId,setPersonId]=useState("");
 const [note,setNote]=useState("");
 const [busy,setBusy]=useState(false);
 const requests=useQuery({queryKey:["institutional","secretary"],queryFn:()=>listSchoolAccessRequests(),retry:false});
 const people=useQuery({queryKey:["institutional","candidates",selected],queryFn:()=>listMatchingPeopleForAccessRequest({data:{requestId:selected!}}),enabled:Boolean(selected)});
 const current=(requests.data??[]).find(r=>r.id===selected);
 const decide=async(decision:"approved"|"rejected"|"needs_information"|"under_review")=>{
  if(!selected)return;setBusy(true);
  try{
   await reviewSchoolAccessRequest({data:{requestId:selected,decision,personId:decision==="approved"?personId:null,note}});
   toast.success("Solicitação actualizada.");
   setSelected(null);setPersonId("");setNote("");
   await client.invalidateQueries({queryKey:["institutional","secretary"]});
  }catch(e){toast.error(e instanceof Error?e.message:"Falha na revisão.");}
  finally{setBusy(false);}
 };
 return <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-label="Solicitações de acesso institucional">
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><ClipboardList className="text-primary"/>Solicitações à secretaria</h2><p className="mt-1 text-sm text-muted-foreground">Verifique o cadastro existente antes de activar o acesso. Nenhuma matrícula é criada por este fluxo.</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{(requests.data??[]).filter(r=>["pending","under_review","needs_information"].includes(r.status)).length} por tratar</span></div>
  {requests.isError?<p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">Não foi possível carregar os pedidos. Verifique se a migração foi aplicada e se tem autorização.</p>:null}
  {requests.isLoading?<p className="text-sm text-muted-foreground">A carregar solicitações…</p>:null}
  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
   <div className="max-h-[32rem] space-y-2 overflow-y-auto">
    {(requests.data??[]).map(r=><button type="button" key={r.id} onClick={()=>{setSelected(r.id);setPersonId("");}} className={`w-full rounded-2xl border p-4 text-left transition ${selected===r.id?"border-primary bg-primary/5":"hover:border-primary/40 hover:bg-muted/30"}`}>
     <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{r.full_name}</p><p className="mt-1 text-xs text-muted-foreground">{r.requested_role} · {new Date(r.created_at).toLocaleDateString("pt-PT")}</p></div><span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">{labels[r.status]??r.status}</span></div>
    </button>)}
    {!requests.isLoading&&!requests.data?.length?<p className="rounded-2xl bg-muted/50 p-5 text-sm text-muted-foreground">Ainda não existem solicitações nesta escola.</p>:null}
   </div>
   {current?<div className="rounded-2xl border bg-muted/20 p-5">
    <div className="mb-3 flex items-center gap-2 font-semibold"><ShieldCheck className="text-primary"/>Verificação institucional</div>
    <dl className="grid gap-2 text-sm"><div><dt className="text-muted-foreground">Nome declarado</dt><dd className="font-semibold">{current.full_name}</dd></div><div><dt className="text-muted-foreground">B.I.</dt><dd>{current.national_id??"Não informado"}</dd></div><div><dt className="text-muted-foreground">Identificador</dt><dd>{current.institutional_id??"Não informado"}</dd></div></dl>
    {["pending","under_review","needs_information"].includes(current.status)?<>
     <div className="mt-5"><label className="flex items-center gap-2 text-sm font-semibold"><Search size={16}/>Associar cadastro existente</label><p className="mt-1 text-xs text-muted-foreground">Apenas correspondências por B.I. ou número institucional. Confirme pessoalmente nome e perfil antes de aprovar.</p>
      <select value={personId} onChange={e=>setPersonId(e.target.value)} className="mt-2 min-h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="">Seleccione um cadastro confirmado</option>{(people.data??[]).map(p=><option key={p.id} value={p.id}>{p.full_name} {p.national_id?"· "+p.national_id:""}</option>)}</select>
      {people.isLoading?<p className="mt-2 text-xs">A procurar cadastros…</p>:null}
      {!people.isLoading&&!people.data?.length?<p className="mt-2 text-xs text-amber-700">Não foi encontrada correspondência exacta. Solicite mais informações antes de aprovar.</p>:null}
     </div>
     <label className="mt-4 block text-sm font-semibold">Nota da secretaria<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border bg-background p-3 text-sm" placeholder="Justificação ou dados adicionais solicitados"/></label>
     <div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy||!personId} onClick={()=>void decide("approved")}><CheckCircle2 size={16} className="mr-1"/>Aprovar vínculo</Button><Button disabled={busy} variant="outline" onClick={()=>void decide("under_review")}>Em análise</Button><Button disabled={busy||!note.trim()} variant="outline" onClick={()=>void decide("needs_information")}>Pedir dados</Button><Button disabled={busy||!note.trim()} variant="destructive" onClick={()=>void decide("rejected")}>Rejeitar</Button></div>
    </>:<p className="mt-5 rounded-xl bg-muted p-3 text-sm">Solicitação concluída.</p>}
   </div>:<div className="grid min-h-56 place-items-center rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">Seleccione uma solicitação para verificar os dados.</div>}
  </div>
 </section>;
}
