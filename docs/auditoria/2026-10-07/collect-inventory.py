import csv, json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).parent

def write_csv(name, fields, rows):
    with (OUT / name).open('w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

routes = []
for base in ['src/routes', 'painel/web/src', 'painel/admin/src/app', 'painel/payflow/app']:
    for p in sorted((ROOT / base).rglob('*.ts*')):
        source = p.read_text()
        matches = re.findall(r'createFileRoute\([\"\']([^\"\']+)', source)
        if base == 'src/routes':
            paths = matches or ([str(p.relative_to(ROOT / base))] if 'server:' in source else [])
        elif base.endswith('/app'):
            paths = ['/' + str(p.parent.relative_to(ROOT / base)).replace('.', '').replace('\\', '/')] if p.name in ['page.tsx', 'route.tsx','route.ts'] else []
        else:
            paths = re.findall(r'path\s*[:=]\s*[\"\']([^\"\']+)', source)
        for path in paths:
            path=re.sub(r'_(?=/|$)','',path)
            path=re.sub(r'/\([^/]+\)','',path)
            routes.append({'app': base.split('/')[1] if base.startswith('painel') else 'SIGA', 'rota': path, 'ficheiro': str(p.relative_to(ROOT)), 'estado': 'Não testado', 'nota': 'Inventariado no código; parâmetros e URLs finais exigem validação. Não prova operação funcional.'})
write_csv('rotas.csv', ['app','rota','ficheiro','estado','nota'], routes)

functions = []
for p in sorted((ROOT / 'src').rglob('*.ts*')):
    source = p.read_text()
    matches = list(re.finditer(r'export const (\w+)\s*=\s*createServerFn\(\{\s*method:\s*[\"\'](GET|POST)', source))
    for i,m in enumerate(matches):
        end = matches[i+1].start() if i+1<len(matches) else len(source)
        body = source[m.start():end]
        functions.append({'funcao':m[1],'metodo':m[2],'ficheiro':str(p.relative_to(ROOT)),'linha':source[:m.start()].count('\n')+1,'middleware_auth':str('requireSupabaseAuth' in body),'guard_escola':str(bool(re.search(r'requireSgaWriter|requirePlatformAdmin|requirePortal|resolveSgaMembership',body))),'mfa_explicito':str(bool(re.search(r'requireAal2|is_aal2',body))),'nota':'Sinais textuais; guardas transitivas exigem revisão. POST pode ser leitura.'})
write_csv('funcoes-servidor.csv', ['funcao','metodo','ficheiro','linha','middleware_auth','guard_escola','mfa_explicito','nota'], functions)
snapshot=json.loads((ROOT/'supabase/PRODUCTION_SNAPSHOT.json').read_text())
write_csv('tabelas.csv',['tabela','colunas','rls','rls_forcada','anon_select','auth_select','politicas'],[{k:(','.join(t[k]) if k=='colunas' else t.get(k,'')) for k in ['tabela','colunas','rls','rls_forcada','anon_select','auth_select','politicas']} for t in snapshot['tabelas']])
features=[]
for d in sorted((ROOT/'src/features').iterdir()):
    if d.is_dir():
        files=list(d.rglob('*.ts*'))
        features.append({'modulo':d.name,'ficheiros':len(files),'testes':len(list((ROOT/'tests'/d.name).rglob('*.test.*'))) if (ROOT/'tests'/d.name).exists() else 0,'estado':'Inventariado; consultar matriz por cenário'})
write_csv('modulos.csv',['modulo','ficheiros','testes','estado'],features)
workflows=[]
for p in sorted((ROOT/'.github/workflows').glob('*.yml')):
    s=p.read_text()
    workflows.append({'ficheiro':str(p.relative_to(ROOT)),'cron':'; '.join(re.findall(r'cron:\s*[\"\']([^\"\']+)',s)),'live':str('SIGA_E2E_LIVE' in s),'nota':'Execução remota não deduzida da existência do workflow.'})
write_csv('automacoes.csv',['ficheiro','cron','live','nota'],workflows)
meta={'branch':subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip(),'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'snapshot':snapshot['capturadoEm'],'rotas':len(routes),'funcoes':len(functions),'modulos':len(features),'tabelas':len(snapshot['tabelas']),'node':subprocess.check_output(['node','--version'],text=True).strip()}
(OUT/'evidencias/inventory-summary.json').write_text(json.dumps(meta,indent=2))
print(json.dumps(meta,indent=2))
