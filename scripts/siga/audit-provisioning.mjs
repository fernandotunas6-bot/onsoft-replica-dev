#!/usr/bin/env node
/**
 * Auditoria de completude das escolas — `npm run siga:audit-provisioning`
 *
 * O provisionamento passou a verificar-se a si próprio: `findProvisioningGaps`
 * confirma as peças antes de declarar sucesso e reverte tudo se faltar alguma
 * (ver src/features/saas/provisioning-verify.ts). Mas isso só protege as
 * escolas criadas a partir de agora.
 *
 * Este script faz a mesma pergunta às escolas que já existem, com as mesmas
 * invariantes. Serve para duas coisas: responder «alguma escola está partida?»
 * sem abrir a consola da base, e detectar deriva — uma subscrição apagada à
 * mão, um domínio removido, um papel perdido numa limpeza.
 *
 * Distingue três coisas que é fácil confundir:
 *
 *   1. **Incompleta** — falta uma peça do provisionamento. É defeito.
 *   2. **Onboarding por concluir** — falta o ano lectivo, e por consequência o
 *      plano financeiro. Não é defeito: `bootstrapSchoolDefaults` não inventa
 *      um ano lectivo de propósito, porque não tem nome nem datas para lhe dar
 *      — o dashboard pede-o como primeiro passo à escola.
 *   3. **Escola de teste** — slugs `e2e-`, `web-`, `mat-`, `gw-`, pelo mesmo
 *      padrão que `siga:e2e-cleanup-stale` usa para as remover.
 *
 * Só lê. Nunca escreve, nunca corrige. A correcção é decisão de quem opera.
 *
 * Requer o CLI do Supabase ligado ao projecto (`supabase link`).
 */
import { execFileSync } from "node:child_process";
import { E2E_SLUG_PATTERN } from "./e2e-cleanup-lib.mjs";

const SQL = `
  with escola as (
    select
      s.id           as school_id,
      s.name         as nome,
      nullif(trim(coalesce(s.nif, '')), '') as nif,
      t.id           as tenant_id,
      t.slug         as slug,
      t.status       as estado
    from public.schools s
    join public.tenants t on t.id = s.tenant_id
  )
  select
    e.slug,
    e.nome,
    e.estado,
    (e.nif is null)                                                                 as sem_nif,
    (select count(*) from public.subscriptions x where x.tenant_id = e.tenant_id)   as subscricoes,
    (select count(*) from public.tenant_domains x where x.tenant_id = e.tenant_id)  as dominios,
    (select count(*) from public.school_memberships m
       join public.profiles p on p.id = m.user_id
      where m.school_id = e.school_id and m.status = 'active')                      as perfis,
    (select count(*) from public.school_memberships x
       where x.school_id = e.school_id and x.status = 'active')                     as memberships,
    (select count(*) from public.member_roles x where x.school_id = e.school_id)    as papeis_atribuidos,
    (select count(*) from public.roles x where x.school_id = e.school_id)           as papeis,
    (select count(*) from public.school_settings x where x.school_id = e.school_id) as definicoes,
    (select count(*) from public.academic_years x where x.school_id = e.school_id)  as anos_lectivos
  from escola e
  order by e.slug
`;

/** As mesmas peças que `findProvisioningGaps` verifica no momento da criação. */
const INVARIANTES = [
  {
    campo: "subscricoes",
    minimo: 1,
    peca: "subscrição",
    porque: "sem ela o plano e o trial não existem",
  },
  {
    campo: "dominios",
    minimo: 1,
    peca: "domínio",
    porque: "sem entrada em tenant_domains não é resolúvel por endereço",
  },
  {
    campo: "perfis",
    minimo: 1,
    peca: "perfil do administrador",
    porque: "nenhum membro activo tem perfil — entra sem cargo nem escola",
  },
  {
    campo: "memberships",
    minimo: 1,
    peca: "membership activa",
    porque: "ninguém resolve a escola ao entrar",
  },
  {
    campo: "papeis_atribuidos",
    minimo: 1,
    peca: "papel atribuído",
    porque: "nenhuma conta tem permissões",
  },
  { campo: "papeis", minimo: 2, peca: "papéis da escola", porque: "não há a quem delegar" },
  {
    campo: "definicoes",
    minimo: 1,
    peca: "definições",
    porque: "o bootstrap não chegou ao fim",
  },
];

function query(sql) {
  const raw = execFileSync("npx", ["supabase", "db", "query", sql, "--linked"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const start = raw.indexOf("{");
  if (start < 0) throw new Error(`resposta inesperada do CLI:\n${raw.slice(0, 400)}`);
  return JSON.parse(raw.slice(start)).rows ?? [];
}

let escolas;
try {
  escolas = query(SQL);
} catch (error) {
  console.error("Não foi possível consultar a base.");
  console.error(error instanceof Error ? error.message : error);
  console.error("\nO script precisa do CLI do Supabase ligado: `npx supabase link`.");
  process.exit(2);
}

const incompletas = [];
const semOnboarding = [];
let semNif = 0;
let deTeste = 0;

for (const escola of escolas) {
  if (escola.sem_nif) semNif += 1;
  if (E2E_SLUG_PATTERN.test(escola.slug ?? "")) deTeste += 1;

  const faltas = INVARIANTES.filter((inv) => Number(escola[inv.campo] ?? 0) < inv.minimo);
  if (faltas.length > 0) incompletas.push({ escola, faltas });
  if (Number(escola.anos_lectivos ?? 0) === 0) semOnboarding.push(escola);
}

console.log(`Escolas auditadas: ${escolas.length}`);
console.log(`Incompletas (defeito): ${incompletas.length}`);
console.log(`Onboarding por concluir: ${semOnboarding.length}`);
console.log(`Slugs de teste (e2e-/web-/mat-/gw-): ${deTeste}`);
console.log(`Sem NIF: ${semNif}`);

if (incompletas.length > 0) {
  console.log("\nIncompletas — falta uma peça que o provisionamento devia ter criado:");
  for (const { escola, faltas } of incompletas) {
    console.log(`  ✗ ${escola.slug} — ${escola.nome} (${escola.estado})`);
    for (const falta of faltas) {
      console.log(`      falta ${falta.peca}: ${falta.porque}`);
    }
  }
}

if (semOnboarding.length > 0) {
  const reais = semOnboarding.filter((e) => !E2E_SLUG_PATTERN.test(e.slug ?? ""));
  console.log(
    `\nSem ano lectivo — ${semOnboarding.length} escola(s), das quais ${reais.length} não são de teste.`,
  );
  console.log(
    "  Não é defeito: o ano lectivo é o primeiro passo do onboarding, que a escola faz no dashboard.",
  );
  console.log("  Sem ele não é possível matricular nem criar plano financeiro.");
  for (const escola of reais) {
    console.log(`  · ${escola.slug} — ${escola.nome}`);
  }
}

if (semNif > 0) {
  // Não conta como incompleta — a escola funciona. Mas a exportação SAF-T
  // recusa-se a gerar sem NIF, e a escola só descobre isso na altura de
  // declarar à AGT. Ver validateSaftSchoolReadiness.
  console.log(
    `\nSem NIF — ${semNif} escola(s). O registo passou a exigi-lo, mas nada corrige o passado:` +
      " sem NIF a exportação SAF-T para a AGT não é gerada.",
  );
}

if (deTeste > 0) {
  console.log(
    `\n${deTeste} escola(s) com slug de teste em produção. ` +
      "`npm run siga:e2e-cleanup-stale -- --dry-run` mostra quais seriam removidas.",
  );
}

if (incompletas.length === 0) {
  console.log("\nNenhuma escola com peças em falta.");
  process.exit(0);
}

console.log(
  `\n${incompletas.length} escola(s) precisam de intervenção. Este script não corrige nada —` +
    " cada caso é uma decisão de quem opera a plataforma.",
);
process.exit(1);
