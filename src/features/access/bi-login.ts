import { z } from "zod";
import { normalizeAngolaIdentity } from "@/lib/angola-identity";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

export const resolveBiToEmailInputSchema = z.object({
 identifier:z.string().trim().min(3).max(100),
 schoolCode:z.string().trim().regex(/^[a-z0-9-]{2,32}$/i).optional(),
});
export type ResolveBiToEmailInput=z.infer<typeof resolveBiToEmailInputSchema>;

/** Resolução de identificadores institucionais: sempre após matrícula confirmada e vínculo activo.
 * O login continua a exigir senha/2FA; B.I. e número de estudante não são autenticação.
 */
export async function resolveBiOrEmailToUserEmail(identifier:string,schoolCode?:string):Promise<string>{
 const trimmed=identifier.trim();
 if(trimmed.includes("@"))return trimmed.toLowerCase();
 const db=await loadSgaAdminClient();
 const compact=normalizeAngolaIdentity(trimmed);
 let schoolId:string|null=null;
 if(schoolCode){
  const {data:school}=await db.from("schools").select("id")
   .eq("public_code",schoolCode.trim()).eq("status","active").maybeSingle();
  if(!school)return trimmed;
  schoolId=school.id;
 }
 const ids=new Set<string>();
 // B.I. só é aceite quando todos os eventuais cadastros associados apontam à mesma identidade.
 let peopleQuery=db.from("people").select("user_id,school_id")
  .eq("national_id",compact).is("deleted_at",null).not("user_id","is",null).limit(20);
 if(schoolId)peopleQuery=peopleQuery.eq("school_id",schoolId);
 const {data:people}=await peopleQuery;
 for(const p of people??[])if(p.user_id)ids.add(p.user_id);
 // Número de estudante nunca é resolvido sem o código da escola.
 if(schoolId){
  const {data:students}=await db.from("students").select("person_id")
   .eq("school_id",schoolId).eq("student_number",trimmed)
   .is("deleted_at",null).limit(2);
  const studentPersonIds=(students??[]).map(x=>x.person_id);
  if(studentPersonIds.length){
   const {data:studentPeople}=await db.from("people").select("user_id")
    .eq("school_id",schoolId).in("id",studentPersonIds).not("user_id","is",null);
   for(const p of studentPeople??[])if(p.user_id)ids.add(p.user_id);
  }
 }
 if(ids.size!==1)return trimmed;
 const userId=[...ids][0]!;
 let memberships=db.from("school_memberships").select("id")
  .eq("user_id",userId).eq("status","active").limit(1);
 if(schoolId)memberships=memberships.eq("school_id",schoolId);
 const {data:active}=await memberships.maybeSingle();
 if(!active)return trimmed;
 const {data:result,error}=await db.auth.admin.getUserById(userId);
 if(error||!result.user?.email||!result.user.email_confirmed_at)return trimmed;
 return result.user.email.toLowerCase();
}
