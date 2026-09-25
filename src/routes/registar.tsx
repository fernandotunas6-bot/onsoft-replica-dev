import { useState,type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap,ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export const Route=createFileRoute("/registar")({component:RegisterIdentity});
function RegisterIdentity(){
 const [fullName,setFullName]=useState("");const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setStatus("");
 try{
  const {data,error}=await supabase.auth.signUp({email:email.trim().toLowerCase(),password,
   options:{data:{full_name:fullName.trim()},emailRedirectTo:window.location.origin+"/boas-vindas"}});
  if(error)throw error;
  if(data.session)window.location.assign("/boas-vindas");
  else setStatus("Consulte o seu e-mail para confirmar a conta. Em seguida, inicie sessão e escolha a escola.");
 }catch{setStatus("Não foi possível concluir o registo. Confirme os dados ou utilize o início de sessão.");}
 finally{setBusy(false);}
 };
 return <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 to-blue-50 p-5">
  <section className="w-full max-w-md rounded-[2rem] border bg-white p-8 shadow-xl shadow-blue-900/5">
   <div className="mb-6 flex items-center gap-3 text-xl font-bold"><GraduationCap className="text-blue-700"/> SIGA Plus</div>
   <h1 className="text-3xl font-extrabold tracking-tight">Criar uma conta</h1>
   <p className="mt-2 text-sm text-slate-600">Uma identidade única para todas as instituições a que tiver acesso autorizado.</p>
   <form onSubmit={submit} className="mt-6 space-y-4">
    <label className="block text-sm font-medium">Nome completo<Input required minLength={3} maxLength={160} value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name" className="mt-2 rounded-xl"/></label>
    <label className="block text-sm font-medium">E-mail<Input required type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" className="mt-2 rounded-xl"/></label>
    <label className="block text-sm font-medium">Senha<Input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" className="mt-2 rounded-xl"/></label>
    <Button type="submit" disabled={busy} className="w-full rounded-xl">{busy?"A criar conta…":"Criar conta"}</Button>
   </form>
   {status?<p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{status}</p>:null}
   <div className="mt-6 flex items-start gap-2 text-xs text-slate-500"><ShieldCheck size={16}/>A escola validará os seus dados antes de conceder acesso.</div>
   <Link to="/" className="mt-5 block text-center text-sm font-semibold text-blue-700">Já tenho conta · iniciar sessão</Link>
  </section>
 </main>;
}
