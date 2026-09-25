import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

import { schoolAccessRequestInputSchema as requestSchema,schoolAccessReviewInputSchema as reviewSchema } from "./institutional-schemas";
async function requireSecretary(userId:string) {
 const membership=await resolveSgaMembershipAdmin(userId);
 if(!membership||!["Administrador","Secretaria"].includes(membership.appRole))
  throw new Error("Esta operação exige autorização da secretaria ou administração.");
 return membership;
}
export const listAvailableSchools=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async()=>{
  const db=await loadSgaAdminClient();
  const {data,error}=await db.from("schools").select("id,name,public_code,province,municipality")
    .eq("status","active").order("name").limit(300);
  if(error)throw publicDatabaseError(error,"Não foi possível consultar as escolas.");
  return data??[];
 });
export const listMySchoolAccessRequests=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const db=await loadSgaAdminClient();
  const {data,error}=await db.from("school_access_requests")
   .select("id,school_id,requested_role,status,review_note,created_at,schools(name)")
   .eq("user_id",context.userId).order("created_at",{ascending:false}).limit(30);
  if(error)throw publicDatabaseError(error,"Não foi possível consultar as suas solicitações.");
  return data??[];
 });
export const submitSchoolAccessRequest=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .validator((input:unknown)=>requestSchema.parse(input))
 .handler(async({data,context})=>{
  const db=await loadSgaAdminClient();
  const {data:school,error:schoolError}=await db.from("schools").select("id")
    .eq("id",data.schoolId).eq("status","active").maybeSingle();
  if(schoolError||!school)throw new Error("A escola não está disponível.");
  const {data:membership}=await db.from("school_memberships").select("id")
    .eq("school_id",data.schoolId).eq("user_id",context.userId).eq("status","active").maybeSingle();
  if(membership)throw new Error("Já possui acesso activo a esta escola.");
  const {data:existing}=await db.from("school_access_requests").select("id")
   .eq("school_id",data.schoolId).eq("user_id",context.userId)
   .in("status",["pending","under_review","needs_information"]).maybeSingle();
  if(existing)return {id:existing.id,alreadyExists:true};
  const {data:created,error}=await db.from("school_access_requests").insert({
   school_id:data.schoolId,user_id:context.userId,full_name:data.fullName,
   national_id:data.nationalId||null,institutional_id:data.institutionalId||null,
   requested_role:data.requestedRole,
  }).select("id").single();
  if(error)throw publicDatabaseError(error,"Não foi possível enviar a solicitação.");
  return {id:created.id,alreadyExists:false};
 });
export const listSchoolAccessRequests=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const membership=await requireSecretary(context.userId);
  const db=await loadSgaAdminClient();
  const {data,error}=await db.from("school_access_requests")
    .select("id,school_id,full_name,national_id,institutional_id,requested_role,status,review_note,created_at,reviewed_at,person_id")
    .eq("school_id",membership.schoolId).order("created_at",{ascending:false}).limit(100);
  if(error)throw publicDatabaseError(error,"Não foi possível consultar os pedidos.");
  return data??[];
 });
export const reviewSchoolAccessRequest=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .validator((input:unknown)=>reviewSchema.parse(input))
 .handler(async({data,context})=>{
  const membership=await requireSecretary(context.userId);
  const db=await loadSgaAdminClient();
  const {data:request,error:readError}=await db.from("school_access_requests")
   .select("id,school_id,user_id,status,requested_role").eq("id",data.requestId)
   .eq("school_id",membership.schoolId).maybeSingle();
  if(readError||!request)throw new Error("Solicitação não encontrada nesta escola.");
  if(!["pending","under_review","needs_information"].includes(request.status))
    throw new Error("Esta solicitação já foi concluída.");
  if(data.decision==="approved"){
   // Pessoa deve ser escolhida e confirmada pela secretaria: nunca usar correspondência automática.
   if(!data.personId)throw new Error("Seleccione e confirme o cadastro de Pessoa antes da aprovação.");
   const {data:person}=await db.from("people").select("id,user_id")
    .eq("id",data.personId).eq("school_id",membership.schoolId).is("deleted_at",null).maybeSingle();
   if(!person||person.user_id&&person.user_id!==request.user_id)
    throw new Error("Cadastro inexistente ou já associado a outra conta.");
   const {error}=await db.rpc("approve_school_access_request",{
    p_request_id:data.requestId,p_reviewer_id:context.userId,p_person_id:data.personId
   });
   if(error)throw publicDatabaseError(error,"Não foi possível concluir a aprovação.");
  }else{
   const {error}=await db.from("school_access_requests").update({
    status:data.decision,review_note:data.note||null,reviewed_by:context.userId,
    reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()
   }).eq("id",request.id).eq("school_id",membership.schoolId)
   .in("status",["pending","under_review","needs_information"]);
   if(error)throw publicDatabaseError(error,"Não foi possível actualizar a solicitação.");
  }
  // Notificação interna best effort, sem afirmar entrega de e-mail.
  await db.from("notifications").insert({
   school_id:membership.schoolId,user_id:request.user_id,channel:"in_app",
   event_type:"school_access_review",title:"Actualização do pedido de acesso",
   body:data.decision==="approved"?"O acesso à instituição foi aprovado.":"A secretaria actualizou o seu pedido de acesso.",
   status:"pending",payload:{request_id:request.id,decision:data.decision}
  }).then(({error})=>{if(error)console.warn("[school-access] notification unavailable",error.code)});
  return {status:data.decision};
 });

export const listMatchingPeopleForAccessRequest=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .validator((input:unknown)=>z.object({requestId:z.string().uuid()}).parse(input))
 .handler(async({data,context})=>{
  const membership=await requireSecretary(context.userId);
  const db=await loadSgaAdminClient();
  const {data:request}=await db.from("school_access_requests")
   .select("national_id,institutional_id").eq("id",data.requestId)
   .eq("school_id",membership.schoolId).maybeSingle();
  if(!request)throw new Error("Solicitação não encontrada.");
  const found=new Map<string,{id:string;full_name:string;national_id:string|null}>();
  if(request.national_id){
   const {data:people,error}=await db.from("people").select("id,full_name,national_id")
    .eq("school_id",membership.schoolId).is("deleted_at",null)
    .eq("national_id",request.national_id).limit(10);
   if(error)throw publicDatabaseError(error,"Não foi possível procurar o cadastro.");
   for(const person of people??[])found.set(person.id,person);
  }
  if(request.institutional_id){
   const [{data:students},{data:teachers}]=await Promise.all([
    db.from("students").select("person_id").eq("school_id",membership.schoolId).eq("student_number",request.institutional_id).limit(10),
    db.from("teachers").select("person_id").eq("school_id",membership.schoolId).eq("employee_number",request.institutional_id).limit(10)
   ]);
   const ids=[...new Set([...(students??[]),...(teachers??[])].map(x=>x.person_id))];
   if(ids.length){
    const {data:people}=await db.from("people").select("id,full_name,national_id")
     .eq("school_id",membership.schoolId).is("deleted_at",null).in("id",ids);
    for(const person of people??[])found.set(person.id,person);
   }
  }
  return [...found.values()];
 });
