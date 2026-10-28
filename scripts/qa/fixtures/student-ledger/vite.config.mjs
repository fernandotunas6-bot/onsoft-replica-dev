import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const auth = `import {useSyncExternalStore} from 'react';
let school='school-A',year='year-2026';const listeners=new Set();
export const currentFixtureContext=()=>({school,year});
window.__changeFixtureContext=(s,y)=>{school=s;year=y;listeners.forEach(fn=>fn());};
export function useSchoolSettings(){useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>school+year);return {school:{id:school,name:'Escola de ensaio'},selectedYearId:year,selectedYearLabel:year==='year-2026'?'2026/2027':'2027/2028'};}`;
const ledger = `import {currentFixtureContext} from 'fixture:auth';
export async function listStudentLedger({data}){const ctx=currentFixtureContext();window.__ledgerRequests=(window.__ledgerRequests||[]).concat([{...ctx,...data}]);
await new Promise(r=>setTimeout(r,100));const mode=new URLSearchParams(location.search).get('mode');if(mode==='error')throw new Error('Falha controlada');if(mode==='empty')return [];
return Array.from({length:73},(_,i)=>({studentId:ctx.school+'-'+i,name:i===0?'Aluno de Ensaio com Nome Institucional Muito Longo de Teste de Acessibilidade e Legibilidade':i===1?'Bento — sem facturas':'Estudante de ensaio '+String(i+1).padStart(2,'0'),number:String(i+1).padStart(7,'0'),classGroupId:i<50?'g1':'g2',className:i<50?'10.ª A — Manhã':'10.ª B — Tarde',gradeId:'grade1',gradeName:'10.ª classe',programId:i<50?'p1':'p2',programName:i<50?'Curso Técnico de Informática e Sistemas de Informação com Designação Extensa':'Enfermagem Geral',levelId:'level1',levelName:'Ensino Secundário Técnico-Profissional',active:i!==2,billed:i===1?0:25000,paid:i===1?0:i%3===0?25000:10000,outstanding:i===1?0:i%3===0?0:15000,overdue:i===1?0:i%3===0?0:15000,invoiceCount:i===1?0:1}));}`;
const invoice = `export async function issueTuitionBatch({data}){window.__issuedBatches=(window.__issuedBatches||[]).concat([data]);await new Promise(r=>setTimeout(r,300));return {issued:data.studentIds.map(studentId=>({studentId,invoiceNumber:'FT-ENSAIO'})),skipped:[],failed:[]};}`;
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: path.join(repo, "node_modules", ".cache", "finance-ledger-qa"),
  publicDir: repo + "/public",
  plugins: [
    {
      name: "controlled-ledger-data",
      enforce: "pre",
      resolveId(id, importer) {
        if (
          id === "fixture:auth" ||
          id === "@/features/auth/use-school-settings" ||
          id.startsWith(repo + "/src/features/auth/use-school-settings")
        )
          return "\0fixture-auth";
        if (id === "../student-ledger-server" && importer?.endsWith("StudentLedgerPanel.tsx"))
          return "\0fixture-ledger";
        if (id === "../server" && importer?.endsWith("StudentLedgerPanel.tsx"))
          return "\0fixture-invoice";
        if (
          id === "@/features/intelligence/active-context" ||
          id.startsWith(repo + "/src/features/intelligence/active-context")
        )
          return "\0fixture-active";
        if (
          id === "@/components/ui/modal-system" ||
          id === repo + "/src/components/ui/modal-system"
        )
          return "\0fixture-modal-barrel";
        return null;
      },
      load(id) {
        if (id === "\0fixture-auth") return auth;
        if (id === "\0fixture-ledger") return ledger;
        if (id === "\0fixture-invoice") return invoice;
        if (id === "\0fixture-modal-barrel")
          return ["ModalShell", "ModalHeader", "ModalContent", "ModalFooter"]
            .map(
              (name) =>
                `export {${name}} from '${repo}/src/components/ui/modal-system/${name}.tsx';`,
            )
            .join("\n");
        if (id === "\0fixture-active")
          return "export const useActiveContext=()=>null; export const crumbsAfterTitle=()=>[];";
      },
    },
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    noDiscovery: true,
    include: ["react", "react-dom/client", "@tanstack/react-query", "@tanstack/react-router"],
  },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/react-router"],
    alias: { "@": repo + "/src" },
  },
  server: {
    host: "127.0.0.1",
    port: 4316,
    strictPort: true,
    fs: { allow: [repo, import.meta.dirname] },
  },
});
