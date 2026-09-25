import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { submitPublicEnrollmentInputSchema } from "@/features/enrollment/schemas";
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
   .select("id,school_id,requested_role,status,review_note,created_at,enrollment_application_id,schools(name)")
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
    .select("id,school_id,full_name,national_id,institutional_id,requested_role,status,review_note,created_at,reviewed_at,person_id,enrollment_application_id")
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
   // Aprovação inicial: permite iniciar o cadastro, sem criar membership nem matrícula.
   const {error}=await db.from("school_access_requests").update({
    status:"preapproved",review_note:data.note||null,reviewed_by:context.userId,
    reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()
   }).eq("id",request.id).eq("school_id",membership.schoolId)
    .in("status",["pending","under_review","needs_information"]);
   if(error)throw publicDatabaseError(error,"Não foi possível autorizar o cadastro.");
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
   body:data.decision==="approved"?"A escola autorizou o início do cadastro. Preencha a candidatura; o acesso escolar só será concedido após confirmação da matrícula.":"A secretaria actualizou o seu pedido de acesso.",
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

/** Etapa 2: reutilizar o formulário académico oficial sem permitir envio antes da pré-aprovação. */
export const getApprovedEnrollmentForm=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .validator((input:unknown)=>z.object({requestId:z.string().uuid()}).parse(input))
 .handler(async({data,context})=>{
  const db=await loadSgaAdminClient();
  const {data:request,error}=await db.from("school_access_requests")
   .select("school_id,status,requested_role,enrollment_application_id").eq("id",data.requestId)
   .eq("user_id",context.userId).maybeSingle();
  if(error||!request||request.status!=="preapproved"||request.enrollment_application_id||request.requested_role!=="student")
   throw new Error("O cadastro só fica disponível depois da autorização da secretaria.");
  const {data:form,error:formError}=await db.from("enrollment_forms")
   .select("id,slug,title,visible_fields,is_open,school_id")
   .eq("school_id",request.school_id).eq("is_open",true).is("deleted_at",null)
   .order("created_at").limit(1).maybeSingle();
  if(formError||!form)throw new Error("A escola ainda não abriu o formulário de matrícula.");
  return form;
 });
export const submitApprovedSchoolEnrollment=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .validator((input:unknown)=>z.object({
  requestId:z.string().uuid(),enrollment:submitPublicEnrollmentInputSchema,
 }).parse(input))
 .handler(async({data,context})=>{
  const db=await loadSgaAdminClient();
  const {data:request,error}=await db.from("school_access_requests")
   .select("id,school_id,status,enrollment_application_id").eq("id",data.requestId)
   .eq("user_id",context.userId).maybeSingle();
  if(error||!request||request.status!=="preapproved"||request.enrollment_application_id)
   throw new Error("A sua escola ainda não autorizou a candidatura.");
  const {data:form}=await db.from("enrollment_forms").select("slug")
   .eq("school_id",request.school_id).eq("slug",data.enrollment.slug)
   .eq("is_open",true).is("deleted_at",null).maybeSingle();
  if(!form)throw new Error("Formulário não pertence à escola autorizada.");
  const {data:applicationId,error:submitError}=await db.rpc("submit_approved_school_enrollment",{
   p_request_id:data.requestId,p_user_id:context.userId,
   p_payload:{
    person:data.enrollment.person,guardianName:data.enrollment.guardianName,
    guardianPhone:data.enrollment.guardianPhone,
    guardianRelationship:data.enrollment.guardianRelationship,
   },
  });
  if(submitError)throw publicDatabaseError(submitError,"Não foi possível enviar a candidatura.");
  return {applicationId:applicationId as string,status:"enrollment_pending" as const};
 });

/** Recuperação segura quando a matrícula foi aceite mas a activação do portal falhou. */
export const finalizeConfirmedEnrollmentAccess=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .validator((input:unknown)=>z.object({requestId:z.string().uuid()}).parse(input))
 .handler(async({data,context})=>{
  const membership=await requireSecretary(context.userId);
  const db=await loadSgaAdminClient();
  const {data:request,error}=await db.from("school_access_requests")
   .select("id,user_id,enrollment_application_id,status").eq("id",data.requestId)
   .eq("school_id",membership.schoolId).maybeSingle();
  if(error||!request||request.status!=="enrollment_pending"||!request.enrollment_application_id)
   throw new Error("O pedido não está a aguardar confirmação de matrícula.");
  const {data:application}=await db.from("enrollment_applications")
   .select("id,student_id,status").eq("id",request.enrollment_application_id)
   .eq("school_id",membership.schoolId).eq("status","accepted").maybeSingle();
  if(!application?.student_id)throw new Error("Confirme primeiro a candidatura e a matrícula na turma.");
  const {data:student}=await db.from("students").select("person_id,student_number")
   .eq("id",application.student_id).eq("school_id",membership.schoolId).maybeSingle();
  if(!student)throw new Error("Cadastro académico da matrícula não encontrado.");
  const {error:approvalError}=await db.rpc("approve_school_access_request",{
   p_request_id:request.id,p_reviewer_id:context.userId,p_person_id:student.person_id,
  });
  if(approvalError)throw publicDatabaseError(approvalError,"A matrícula está confirmada mas o acesso ainda não pôde ser activado.");
  const {error:notifyError}=await db.from("notifications").insert({
   school_id:membership.schoolId,user_id:request.user_id,
   channel:"in_app",event_type:"school_access_activated",
   title:"Credenciais institucionais activadas",
   body:"A sua matrícula foi confirmada. Já pode entrar no portal da escola com a senha da sua conta.",
   status:"pending",payload:{request_id:request.id,student_id:application.student_id},
  });
  if(notifyError)console.warn("[institutional-enrollment] notification:",notifyError.code);
  return {status:"approved" as const,studentNumber:student.student_number};
 });
/** Mostra apenas identificadores próprios depois de confirmar vínculo e matrícula. */
export const getMyInstitutionalCredentials=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const membership=await resolveSgaMembershipAdmin(context.userId);
  if(!membership)return null;
  const db=await loadSgaAdminClient();
  const {data:request}=await db.from("school_access_requests")
   .select("person_id").eq("school_id",membership.schoolId)
   .eq("user_id",context.userId).eq("status","approved")
   .not("person_id","is",null).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  if(!request?.person_id)return null;
  const [{data:student},{data:person},{data:school}]=await Promise.all([
   db.from("students").select("student_number").eq("school_id",membership.schoolId)
    .eq("person_id",request.person_id).is("deleted_at",null).maybeSingle(),
   db.from("people").select("national_id").eq("school_id",membership.schoolId)
    .eq("id",request.person_id).eq("user_id",context.userId).maybeSingle(),
   db.from("schools").select("name,public_code").eq("id",membership.schoolId).maybeSingle(),
  ]);
  if(!student||!person||!school)return null;
  const bi=person.national_id??"";
  return {
   schoolName:school.name,schoolCode:school.public_code,
   studentNumber:student.student_number,
   biMasked:bi.length>4?"••••"+bi.slice(-4):null,
   passwordInstruction:"Use a senha da sua conta SIGA Plus ou a recuperação segura de senha.",
  };
 });
