#!/usr/bin/env node
// Verificação do modo SIGA depois de publicar (só leituras; nada é gravado).
//
//   SGA_TOKEN=<token de acesso Supabase> \
//   WORKER_URL=https://siga-yft.<conta>.workers.dev \
//   PORTAL_URL=https://portal-siga.com \
//   node scripts/verificar-modo-siga.mjs
//
// O token: entrar no portal do SIGA com a conta a testar (encarregado,
// professor ou direcção) e, nas ferramentas do navegador, copiar
// `access_token` do item `sb-…-auth-token` do Local Storage. Dura 1 hora e é
// pessoal: não o partilhar nem o guardar em ficheiros.
//
// Não chama GET /api/mobile/attendance (cria as sessões de chamada do dia)
// nem nenhuma rota de escrita.

const { SGA_TOKEN, WORKER_URL, PORTAL_URL } = process.env;
if (!SGA_TOKEN || !WORKER_URL) {
  console.error('Falta SGA_TOKEN ou WORKER_URL (ver o início deste ficheiro).');
  process.exit(2);
}
const worker = WORKER_URL.replace(/\/+$/, '');
const portal = (PORTAL_URL ?? '').replace(/\/+$/, '');
const auth = { Authorization: `Bearer ${SGA_TOKEN}` };
const results = [];

async function check(label, url, { expect = [200], headers = auth, method = 'GET', summary } = {}) {
  let status = 0;
  let note = '';
  try {
    const res = await fetch(url, { method, headers });
    status = res.status;
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* não é JSON */
    }
    if (!expect.includes(status)) note = body?.error ?? body?.message ?? text.slice(0, 80);
    else if (summary && body) note = summary(body, res);
    results.push({ ok: expect.includes(status), label, status, note });
    return expect.includes(status) ? body : null;
  } catch (error) {
    results.push({ ok: false, label, status, note: String(error?.message ?? error) });
    return null;
  }
}

const count = (key = 'data') => (b) => {
  const n = (b[key] ?? []).length;
  return n === 1 ? '1 item' : `${n} itens`;
};

await check('Worker vivo', `${worker}/health`, { headers: {} });
await check('Sem sessão é recusado', `${worker}/api/sga/me`, { headers: {}, expect: [401] });
const me = await check('Conta e escola (/me)', `${worker}/api/sga/me`, {
  summary: (b) => `${b.name ?? '—'} · ${b.school?.name} · papel ${b.role}`,
});
const role = me?.role;

await check('Calendário académico', `${worker}/api/sga/academic-calendar`, {
  summary: (b) => (b.data ? `${b.data.academic_year}, ${b.data.terms.length} trimestres` : 'sem ano activo'),
});
await check('Turmas', `${worker}/api/sga/classes`, { summary: count() });
await check('Disciplinas', `${worker}/api/sga/subjects`, { summary: count() });
await check('Comunicados', `${worker}/api/sga/notices`, { summary: count() });

if (role === 'parent') {
  const wards = await check('Educandos', `${worker}/api/sga/wards`, { summary: count() });
  await check('Recibos', `${worker}/api/sga/finance/receipts`, { summary: count() });
  const ward = wards?.data?.[0];
  if (ward) {
    await check(`Horário (${ward.class_name ?? 'turma'})`, `${worker}/api/sga/timetable?class_id=${ward.class_id}`, { summary: count() });
    await check(`Faltas de ${ward.name}`, `${worker}/api/sga/attendance/student/${ward.id}`, {
      summary: (b) => `${b.present_days} dias presente, ${b.absent_days} com falta`,
    });
    await check(`Boletim de ${ward.name} (1.º trim.)`, `${worker}/api/sga/grades?student_id=${ward.id}&term=Term%201`, {
      summary: (b) => `${b.academic_year}: ${b.data.filter((l) => l.mt != null).length}/${b.data.length} disciplinas com nota`,
    });
  }
}

if (role === 'teacher') {
  await check('Os meus tempos', `${worker}/api/sga/timetable?mine=1`, { summary: count() });
  const mine = await check('As minhas disciplinas', `${worker}/api/sga/teacher/classes`, { summary: count() });
  const a = mine?.data?.[0];
  if (a) {
    await check(
      `Notas ${a.class_name} · ${a.subject_name} (1.º trim.)`,
      `${worker}/api/sga/teacher/grades?class_group_id=${a.class_group_id}&subject_id=${a.subject_id}&term=1`,
      { summary: (b) => `${b.students.length} alunos${b.provisional ? '' : ', diário fechado'}` },
    );
    await check(`Faltas da turma ${a.class_name}`, `${worker}/api/sga/attendance/summary?class_id=${a.class_group_id}`, {
      summary: (b) => `${b.data.length} alunos, ${b.days_marked} dias marcados`,
    });
  }
}

if (portal) {
  const origin = { Origin: worker.replace(/^https?:\/\/[^.]+/, 'https://m') };
  await check('Portal: CORS das rotas móveis', `${portal}/api/mobile/chat`, {
    method: 'OPTIONS',
    headers: { ...origin, 'Access-Control-Request-Method': 'GET' },
    expect: [204],
    summary: (_, res) => res.headers.get('access-control-allow-origin') ?? 'sem Allow-Origin',
  });
  await check('Portal: conversas (/api/mobile/chat)', `${portal}/api/mobile/chat`, {
    summary: (b) => `${(b.conversations ?? []).length} conversas`,
  });
  await check('Portal: sem sessão é recusado', `${portal}/api/mobile/chat`, { headers: {}, expect: [401] });
}

const width = Math.max(...results.map((r) => r.label.length));
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.label.padEnd(width)}  ${String(r.status).padStart(3)}  ${r.note}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} verificação(ões) falharam.` : '\nTudo certo.');
process.exit(failed ? 1 : 0);
