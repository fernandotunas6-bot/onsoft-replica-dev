import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2,ClipboardList,ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listSchoolAccessRequests,reviewSchoolAccessRequest,finalizeConfirmedEnrollmentAccess } from "@/features/access/institutional-requests.server";

const labels:Record<string,string>={pending:"Pendente",under_review:"Em análise",needs_information:"Informações necessárias",preapproved:"Cadastro autorizado",approved:"Acesso confirmado",rejected:"Rejeitado",cancelled:"Cancelado",enrollment_pending:"Matrícula em análise",enrollment_rejected:"Matrícula recusada"};
export function InstitutionalAccessRequestsPanel(){
 const client=useQueryClient();
 const [selected,setSelected]=useState<string|null>(null);
 const [note,setNote]=useState("");
 const [busy,setBusy]=useState(false);
 const requests=useQuery({queryKey:["institutional","secretary"],queryFn:()=>listSchoolAccessRequests(),retry:false});
 const current=(requests.data??[]).find(r=>r.id===selected);
 const finalize=async()=>{if(!selected)return;setBusy(true);
  try{await finalizeConfirmedEnrollmentAccess({data:{requestId:selected}});
   toast.success("Matrícula e acesso institucional confirmados.");
   await client.invalidateQueries({queryKey:["institutional","secretary"]});
  }catch(error){toast.error(error instanceof Error?error.message:"Não foi possível activar o acesso.");}
  finally{setBusy(false);}
 };
 const decide=async(decision:"approved"|"rejected"|"needs_information"|"under_review")=>{
  if(!selected)return;setBusy(true);
  try{
   await reviewSchoolAccessRequest({data:{requestId:selected,decision,note}});
   toast.success("Solicitação actualizada.");
   setSelected(null);setNote("");
   await client.invalidateQueries({queryKey:["institutional","secretary"]});
  }catch(e){toast.error(e instanceof Error?e.message:"Falha na revisão.");}
  finally{setBusy(false);}
 };
 return <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-label="Solicitações de acesso institucional">
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><ClipboardList className="text-primary"/>Solicitações à secretaria</h2><p className="mt-1 text-sm text-muted-foreground">Autorize primeiro a apresentação da candidatura; a confirmação da matrícula e a activação do acesso são etapas posteriores.</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{(requests.data??[]).filter(r=>["pending","under_review","needs_information"].includes(r.status)).length} por tratar</span></div>
  {requests.isError?<p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">Não foi possível carregar os pedidos. Verifique se a migração foi aplicada e se tem autorização.</p>:null}
  {requests.isLoading?<p className="text-sm text-muted-foreground">A carregar solicitações…</p>:null}
  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
   <div className="max-h-[32rem] space-y-2 overflow-y-auto">
    {(requests.data??[]).map(r=><button type="button" key={r.id} onClick={()=>setSelected(r.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selected===r.id?"border-primary bg-primary/5":"hover:border-primary/40 hover:bg-muted/30"}`}>
     <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{r.full_name}</p><p className="mt-1 text-xs text-muted-foreground">{r.requested_role} · {new Date(r.created_at).toLocaleDateString("pt-PT")}</p></div><span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">{labels[r.status]??r.status}</span></div>
    </button>)}
    {!requests.isLoading&&!requests.data?.length?<p className="rounded-2xl bg-muted/50 p-5 text-sm text-muted-foreground">Ainda não existem solicitações nesta escola.</p>:null}
   </div>
   {current?<div className="rounded-2xl border bg-muted/20 p-5">
    <div className="mb-3 flex items-center gap-2 font-semibold"><ShieldCheck className="text-primary"/>Verificação institucional</div>
    <dl className="grid gap-2 text-sm"><div><dt className="text-muted-foreground">Nome declarado</dt><dd className="font-semibold">{current.full_name}</dd></div><div><dt className="text-muted-foreground">B.I.</dt><dd>{current.national_id??"Não informado"}</dd></div><div><dt className="text-muted-foreground">Identificador</dt><dd>{current.institutional_id??"Não informado"}</dd></div></dl>
    {["pending","under_review","needs_information"].includes(current.status)?<>
     <p className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Esta é a primeira decisão. A aprovação permite que o candidato preencha o cadastro completo e envie os documentos. Não cria matrícula, vínculo escolar nem credenciais definitivas.</p>
     <label className="mt-4 block text-sm font-semibold">Nota da secretaria<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border bg-background p-3 text-sm" placeholder="Justificação ou dados adicionais solicitados"/></label>
     <div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void decide("approved")}><CheckCircle2 size={16} className="mr-1"/>Autorizar cadastro</Button><Button disabled={busy} variant="outline" onClick={()=>void decide("under_review")}>Em análise</Button><Button disabled={busy||!note.trim()} variant="outline" onClick={()=>void decide("needs_information")}>Pedir dados</Button><Button disabled={busy||!note.trim()} variant="destructive" onClick={()=>void decide("rejected")}>Rejeitar</Button></div>
    </>:<div className="mt-5 rounded-xl bg-muted p-3 text-sm"><p>{current.status==="preapproved"?"A aguardar cadastro completo do candidato.":current.status==="enrollment_pending"?"A candidatura está na área de matrículas. Confirme os documentos, a matrícula e a turma antes de activar o portal.":"Solicitação concluída."}</p>{current.status==="enrollment_pending"?<Button disabled={busy} className="mt-3" onClick={()=>void finalize()}>Activar após confirmação da matrícula</Button>:null}</div>}
   </div>:<div className="grid min-h-56 place-items-center rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">Seleccione uma solicitação para verificar os dados.</div>}
  </div>
 </section>;
}
