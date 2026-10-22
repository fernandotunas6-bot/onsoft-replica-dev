"""Inventário rastreável de contratos e SPECs. Não executa SQL nem altera dados."""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/specs/modules"
OUT.mkdir(parents=True, exist_ok=True)
snapshot = json.loads((ROOT / "supabase/PRODUCTION_SNAPSHOT.json").read_text())
tables = {t["tabela"]: t for t in snapshot["tabelas"]}
catalog = json.loads((ROOT / "scripts/siga/modules.json").read_text())

# Fonte das responsabilidades: skills SIGA e arquitectura canónica. As decisões
# institucionais não são preenchidas por este inventário.
META = {
"academic": ("Avaliações, presenças, notas e pautas", "Professor, Secretaria e Administrador, com âmbito por turma/disciplina", "Configurar instrumentos → registar presença/avaliação → lançar notas → rever → fechar → emitir pauta → decidir transição", "As fórmulas e a decisão de promoção vêm do modelo vigente; ausência, zero e dispensa são distintos. Fecho de período impede alterações não autorizadas.", "SGA_ANGOLA_LESSON_PLANS_ASSESSMENTS_2026.md"),
"access": ("Contas, vínculos e permissões", "Administrador gere; utilizador pede vínculo e aceita convite", "Pedir acesso → verificar identidade → aprovar/rejeitar → atribuir papel → conceder/repor grant → revogar", "Identidade Auth é partilhada entre escolas; alterações globais não podem prejudicar outro vínculo. Grant por módulo sobrepõe cargo e exige MFA para escrita.", "SGA_SECURITY_ACCESS_SPEC.md"),
"ai-assist": ("Assistência pedagógica", "Pessoal autorizado pelo módulo e pelas capacidades instaladas", "Seleccionar contexto escolar → pedir sugestão → rever resultado → confirmar acção autorizada", "Uma sugestão não é registo persistido; não enviar segredos nem dados de outra escola a um fornecedor.", None),
"alumni": ("Antigos alunos e portefólios", "Pessoal autorizado; antigo aluno no próprio perfil", "Preparar perfil → consentimento → publicar âmbito permitido → consultar oportunidades → actualizar portefólio", "Privacidade/consentimento antecedem directório e contactos; os dados privados não entram automaticamente no showcase.", None),
"arquivos": ("Arquivos escolares", "Pessoal autorizado; aluno/encarregado apenas no âmbito permitido", "Seleccionar ficheiro → validar → carregar bytes → gravar metadados → consultar/descarregar → substituir/arquivar", "Existência de metadados não prova upload; links e paths exigem âmbito e expiração. Reversão não elimina anexos pré-existentes.", None),
"audit": ("Auditoria e rastreabilidade", "Pessoal com audit.logs.read; produtor de eventos no servidor", "Executar operação → gravar actor/escola/acção → filtrar histórico → investigar evento", "Logs de negócio não são importáveis como dados do utilizador; não incluir credenciais ou payloads pessoais completos por conveniência.", "SGA_SECURITY_ACCESS_SPEC.md"),
"auth": ("Autenticação e contexto escolar", "Todos os utilizadores; autenticação não equivale a autorização escolar", "Entrar → verificar sessão/MFA → resolver vínculo → escolher escola → abrir módulo → terminar sessão", "JWT deve ser verificado, user_metadata não concede papéis; escola seleccionada é preferência validada no servidor.", "SGA_SECURITY_ACCESS_SPEC.md"),
"calendar": ("Ano e calendário lectivo", "Administrador activa/cria ano; Administrador e Secretaria gerem períodos", "Indicar datas institucionais → criar/activar ano → criar períodos → consultar agenda → subscrever ICS", "Um ano activo por escola; terms são os períodos reais. Activação não certifica encerramento académico/financeiro.", "SGA_ACADEMIC_TIME_SHIFTS_BREAKS_GATE_SPEC.md"),
"catracas": ("Catracas e cartões de acesso", "Administrador gere dispositivo/cartão; utilizador usa credencial própria", "Registar dispositivo → emitir cartão → autenticar leitura → verificar âmbito/replay → registar acesso", "Dispositivo e cartão têm vínculo escolar; segredos só no servidor. Acesso físico não substitui presença de aula.", "SGA_GATE_QR_LESSON_ATTENDANCE_PAYROLL_SPEC.md"),
"communications": ("Comunicação institucional", "Pessoal autorizado; destinatários segundo o âmbito escolar", "Preparar comunicação → seleccionar audiência → validar destinos → publicar/enviar → acompanhar estado", "Link para fornecedor não é entrega; notificações reais só após confirmação do transporte e destinatários autorizados.", None),
"contacts": ("Contactos e relações", "Pessoal autorizado; dados pessoais sujeitos ao âmbito da pessoa", "Pesquisar pessoa/contacto → verificar relação → consultar canal autorizado → actualizar informação", "Contacto não concede acesso ao portal; relação familiar e responsabilidade financeira são campos distintos.", None),
"dashboard": ("Painéis e portais por perfil", "Direcção, Administrador, Secretaria, Tesouraria, Professor, Aluno e Encarregado", "Resolver perfil/escola → carregar indicadores reais → abrir tarefa → concluir no módulo responsável → actualizar resumo", "Indicadores derivam de registos autorizados; professor só vê atribuições, aluno só a própria ficha, encarregado só educandos vinculados.", None),
"documents": ("Documentos, modelos e exportações", "Pessoal autorizado em documentos e no domínio dos dados exportados", "Escolher modelo → seleccionar pessoa/turma/período → validar dados → gerar → imprimir/descarregar → verificar autenticidade", "Modelo/assinante devem pertencer à escola; filtros da lista devem acompanhar exportação; homologação/legalidade não são inferidas do PDF.", None),
"enrollment": ("Candidatura e matrícula pública", "Visitante envia; Secretaria/Administrador analisam", "Abrir campanha → enviar candidatura → emitir talão → analisar → aceitar/rejeitar → criar aluno → encaminhar matrícula", "Número CAND é canónico; decisão repetida não pode criar outro aluno; turma é da escola/ano do formulário.", None),
"finance": ("Tesouraria escolar", "Administrador/Tesouraria escrevem; aluno/encarregado consultam âmbito próprio", "Configurar plano → emitir obrigação → receber/confirmar pagamento → emitir recibo → reconciliar saldo → estornar com motivo", "Valor, desconto e multa seguem regras activas; provider confirma no backend; estorno e webhook repetido não duplicam movimentos.", None),
"higher-ed": ("Ensino superior", "Secretaria, Administrador e Professor nas atribuições respectivas", "Configurar curso/unidade → inscrever estudante → atribuir docente → avaliar → aplicar estatuto válido → certificar", "Inscrição por cadeira e estatutos têm vigência e escola; não inventar equivalências, créditos ou regras de certificação.", None),
"hr": ("Recursos humanos e salários", "Administrador e responsáveis com permissões RH/financeiras próprias", "Vincular trabalhador → contrato → assiduidade/remuneração → preparar folha → aprovar → pagar → reconciliar/anular", "Salário segue contrato/tabela e política configurados; dados bancários sensíveis ficam no servidor; aprovação/pagamento/anulação exigem MFA e auditoria.", "SGA_GATE_QR_LESSON_ATTENDANCE_PAYROLL_SPEC.md"),
"import": ("Importações e exportação de intercâmbio", "Secretaria para dados académicos; Tesouraria para financeiros; Administrador", "Ficheiro → análise → mapping → validação/duplicados → preview → staging → commit → relatório → reimportação/rollback", "Só importadores governados gravam; total aceito/rejeitado/pendente deve reconciliar. CSV/XLSX acima de 25000 linhas por folha são recusados antes de gravar.", "SGA_IMPORT_EXPORT_PREMIUM_SPEC.md"),
"integrations": ("Integrações e capacidades", "Administrador instala/configura; utilizadores com capacidade concedida usam", "Instalar → conceder capacidade → configurar credencial no servidor → executar → confirmar resultado → diagnosticar/repetir", "catalog-ready, deep-link, cópia, exportação e HTTP confirmado são capacidades diferentes; segredo não vai ao browser.", None),
"intelligence": ("Indicadores e inteligência escolar", "Pessoal autorizado no domínio de origem", "Seleccionar contexto → obter dados reais → calcular sinal/indicador → rever evidência → encaminhar intervenção autorizada", "Sinal é apoio à decisão, sem inventar nota, dívida ou registo; âmbito dos dados de origem é conservado.", None),
"lesson-plans": ("Planos de aula", "Professor nas próprias turmas; Direcção/Administrador na supervisão autorizada", "Escolher turma/disciplina → preparar plano → guardar componentes → rever/publicar → relacionar aula e evidências", "Associação ao horário/avaliação não elimina autorização; aprovação e estados seguem contratos existentes.", "SGA_ANGOLA_LESSON_PLANS_ASSESSMENTS_2026.md"),
"messages": ("Mensagens internas", "Utilizadores e destinatários permitidos na escola", "Seleccionar conversa autorizada → enviar → persistir → receber → consultar histórico", "A entrega e o acesso à conversa não dependem apenas do menu; cache e realtime devem respeitar a troca de escola.", None),
"notifications": ("Notificações e preferências", "Utilizador sobre as próprias preferências; servidor produz eventos autorizados", "Evento de negócio → resolver audiência → gerar notificação → entregar → ler → marcar estado/preferência", "Evento repetido não duplica efeito; destinatários e preferências não atravessam escolas.", None),
"otp": ("Códigos de autenticação", "Destinatário e fluxo que originou o código", "Pedir código → limitar tentativas → enviar a destino de teste → validar → expirar/rejeitar reuso", "OTP confirma identidade/destino; não cria permissão escolar por si. Conteúdo e códigos não devem ir aos logs.", "SGA_SECURITY_ACCESS_SPEC.md"),
"pedagogica": ("Estrutura académica, turmas e horários", "Administrador/Secretaria configuram; Professor consulta atribuições", "Configurar níveis/cursos/disciplinas → classes/salas → turma/ano/capacidade → atribuir docentes → preparar/publicar horário", "Escola/ano coerentes em todas as relações; capacidade e conflito de turma/sala/professor são verificados no servidor.", "SGA_TIMETABLE_PUBLICATION_UX_SPEC.md"),
"people": ("Registo central de pessoas", "Administrador/Secretaria gerem; outros apenas no âmbito autorizado", "Pesquisar duplicados → cadastrar pessoa/documentos → atribuir papel → vincular familiar → editar com versão → arquivar", "Uma pessoa pode ter vários papéis; identidade institucional e vínculos não são reescritos por alteração de contacto.", None),
"saas": ("Provisionamento e administração da plataforma", "Visitante no signup; platform_admins no controlo global", "WEB recolhe instituição/conta → API provisiona tenant/escola/vínculos/plano/domínio → ADMIN supervisiona → SIGA inicia configuração", "Administrador escolar não é administrador da plataforma; subscrição SaaS é distinta de propina. Rollback e limites são verificáveis.", None),
"school": ("Configuração institucional", "Administrador escolar; Secretaria nos campos permitidos", "Resolver escola → completar identidade/localização → seleccionar ano → configurar avaliação/cobrança/modelos → guardar versão → reler", "Dados e versão persistem após refresh/login; ausência de configuração deve orientar o próximo passo e impedir operação dependente.", None),
"spotlight": ("Pesquisa e atalhos de trabalho", "Utilizador autenticado com permissão no destino", "Pesquisar tarefa/registo → filtrar capacidades autorizadas → abrir destino com contexto → executar na área responsável", "Resultado de pesquisa não concede acesso; o endpoint de destino volta a validar âmbito e permissão.", None),
"students": ("Alunos, matrícula interna e renovação", "Administrador/Secretaria escrevem; aluno e encarregado consultam dados próprios", "Preencher cinco passos → validar duplicados/contexto → guardar pessoa/aluno/encarregados/turma/histórico atomicamente → abrir ficha → renovar/transitar após decisão", "Número EST/MAT vem das sequências existentes; pedido UUID é reutilizado no reenvio; turma cheia não admite matrícula extraordinária fictícia.", None),
}

def link(path, label=None):
    p = Path(path)
    return f"[{label or p.name}](../../../{p.as_posix()})"

def files_for(folder):
    return sorted(p for p in folder.rglob("*") if p.suffix in {".ts", ".tsx", ".mjs", ".py"} and p.is_file())

coverage = []
api_rows = []
index = ["# SPECs do SIGA Plus", "", "Actualizado a 8 de Outubro de 2026. Referência: banco SGA existente, snapshot de 189 tabelas capturado a 06/10 e catálogo consultado a 07/10; não uma base alternativa.", "", "**Implementado** descreve código presente, não certificação funcional. **Proposto** descreve trabalho ainda sem prova de aceitação. **Por decidir** exige regra institucional, credencial, fornecedor ou infra-estrutura. Migrações preparadas não são produção actual.", "", "As SPECs de módulo abaixo completam as especificações temáticas anteriores, que conservam as suas datas históricas. Fonte de estados/colunas: `supabase/PRODUCTION_SNAPSHOT.json`; fonte de campos/validações: schemas ligados em cada módulo. Uma página ou um teste mock não prova UI→API→persistência real.", "", "[Regras transversais](CONTRATOS_TRANSVERSAIS.md) · [Alterações críticas e aceitação](CORRECCOES_2026-10-08.md) · [Progresso](../implementation/2026-10-07/PROGRESSO.md) · [Matriz](matriz-evolucao.csv) · [Contratos API inventariados](contratos-api.csv)", "", "| Módulo | SPEC | Estado de validação |", "| --- | --- | --- |"]
for module, meta in META.items():
    folder = ROOT / "src/features" / module
    sources = files_for(folder)
    title, roles, flow, rule, reference = meta
    used_tables = set()
    contracts = []
    schemas = []
    fields = []
    for p in sources:
        text = p.read_text()
        rel = p.relative_to(ROOT).as_posix()
        used_tables.update(re.findall(r'\.from\("([a-z_0-9]+)"\)', text))
        for m in re.finditer(r'export const (\w+)\s*=\s*createServerFn\(\{\s*method:\s*"(GET|POST)"', text):
            end = text.find("export const ", m.end())
            body = text[m.end(): end if end > 0 else None]
            schema = re.search(r'(\w+Schema)\.parse\(', body)
            contracts.append((m[1], m[2], schema[1] if schema else "Sem schema de entrada explícito neste bloco", rel))
            api_rows.append({"modulo": module, "funcao": m[1], "metodo": m[2], "schema": schema[1] if schema else "—", "fonte": rel, "estado": "Implementado; validação individual por concluir"})
        if "schema" in p.name:
            schemas.append(rel)
            for m in re.finditer(r'^\s{2}([a-zA-Z_][\w]*):\s*([^\n]+)', text, re.M):
                fields.append((m[1], m[2].strip().replace("|", "\\|")[:150], rel))
    if module == "students": used_tables.update(["people", "students", "student_guardians", "student_status_history", "audit_logs", "enrollments"])
    if module == "calendar": used_tables.update(["academic_years", "terms"])
    known = sorted(used_tables & tables.keys())
    unconfirmed = sorted(used_tables - tables.keys())
    state_lines = []
    for state in snapshot["valores"]:
        if state["tabela"] in known:
            state_lines.append(f"- `{state['tabela']}.{state['coluna']}`: " + ", ".join(f"`{v}`" for v in state["valores"]))
    module_sources = [m for m in catalog["modules"] if any(str(f).startswith(f"src/features/{module}/") for f in m.get("feature", []))]
    routes = sorted({r for m in module_sources for r in m.get("routes", [])})
    test_roots = {ROOT / "tests" / module}
    aliases = {"students": ["students"], "pedagogica": ["pedagogica", "timetable"], "academic": ["academic", "assessment", "attendance", "grade-sheets"], "finance": ["finance"], "access": ["access", "auth"], "auth": ["auth"], "saas": ["saas"]}
    test_roots.update(ROOT / "tests" / t for t in aliases.get(module, []))
    tests = sorted({p.relative_to(ROOT).as_posix() for test_root in test_roots if test_root.exists() for p in test_root.rglob("*.test.*")})
    text = [f"# {title}", "", "**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.", "", "## Objectivo e âmbito", "", title + "; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.", "", "## Estado actual e comportamento pretendido", "", "**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.", "", "**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.", "", "## Perfis e permissões", "", roles + ". O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.", "", "## Pré-condições e dependências", "", "Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.", "", "## Fluxo principal e alternativas", "", flow + ".", "", "Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.", "", "## Estados e transições", ""]
    text += state_lines or ["Os estados efectivos estão nos schemas e contratos abaixo; não se propõe um novo enum por inferência da interface."]
    text += ["", "Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.", "", "## Campos, formatos e validações", "", "Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.", ""]
    if fields:
        text += ["| Campo | Declaração observada | Schema de origem |", "| --- | --- | --- |"]
        for field, declaration, source in fields:
            text.append(f"| `{field}` | `{declaration}` | {link(source)} |")
    else:
        text += ["Sem declaração de campos Zod local inventariada; consultar o contrato de origem/importado nas fontes, antes de qualquer alteração."]
    text += ["", "## Regras de negócio e fonte", "", rule, "", "Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**."]
    if reference: text += ["", f"Especificação complementar: [{reference}](../{reference})."]
    text += ["", "## Modelo de dados e relações", "", "Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:", "", "| Tabela | Colunas existentes |", "| --- | --- |"]
    for name in known: text.append(f"| `{name}` | " + ", ".join(f"`{c}`" for c in tables[name]["colunas"]) + " |")
    if not known: text += ["| — | Este módulo pode consumir contratos de outro domínio sem tabela própria; consultar as fontes. |"]
    relations = sorted({f"`{r['de']}` → `{r['para']}` (`{r['chave']}`)" for r in snapshot["relacoes"] if r["de"] in known})
    text += ["", "Relações confirmadas:", ""] + ["- " + r for r in relations]
    if unconfirmed: text += ["", "**Referências não confirmadas como tabelas neste snapshot:** " + ", ".join(f"`{t}`" for t in unconfirmed) + ". Podem ser views, buckets ou variantes; não criar tabelas para silenciar uma diferença sem verificar o catálogo."]
    text += ["", "## Contratos de API e erros", "", "| Função | Método | Entrada | Fonte |", "| --- | --- | --- | --- |"]
    for name, method, schema, source in contracts: text.append(f"| `{name}` | {method} | `{schema}` | {link(source)} |")
    if not contracts: text += ["| — | — | Serviços/helpers ou endpoint de origem | Ver fontes |"]
    text += ["", "Erros esperados: sessão expirada, vínculo/grant insuficiente, AAL1 em escrita sensível, entrada inválida, recurso inexistente/fora do âmbito, conflito/duplicado, dependência indisponível e falha de persistência. Não expor SQL, tokens nem detalhes pessoais em mensagens/logs. A existência do endpoint não é prova de aceitação por perfil.", "", "## Isolamento entre escolas", "", "Verificar A/B em UI, ID enviado, servidor, RLS quando exposta, exportação, anexos, cache e realtime. `is_school_member` inclui alunos/encarregados: não serve sozinho para dados sensíveis/escrita. Cliente administrativo exige guardas e filtros de âmbito; troca de escola invalida o contexto anterior.", "", "## Interface desktop e mobile", "", "Preservar design system e terminologia; controlar largura de tabelas e altura de modais; campos com label e foco visível. Acção principal ligada ao estado real do pedido, sem duplo envio; confirmação de destruição; retorno com filtros/contexto. Viewport emulado não comprova toque, rotação, teclado virtual ou WebView nativo.", "", "## Carregamento, vazio, sucesso, falha e acesso negado", "", "Carregamento acompanha o pedido; vazio tem próxima acção adequada ao perfil. Sucesso exige resultado persistido/confirmado. Falha conserva dados e permite recuperação. Acesso negado não apresenta registos de outro âmbito nem aparenta lista vazia por erro silenciado.", "", "## Auditoria e notificações", "", "Actor/escola/acção/motivo/versão quando relevantes. Notificação é efeito do evento confirmado, com destinatário autorizado e repetição controlada. Destinos reais não são usados em ensaios. Logs não contêm senhas, códigos ou segredos.", "", "## Critérios de aceitação", "", "1. Perfil permitido conclui o fluxo principal; UI, pedido e banco concordam após refresh/login.", "2. Entrada inválida e recurso de B enviado por A não produzem escrita nem exposição.", "3. Pedido repetido e falha intermédia deixam resultado consistente; histórico e efeitos dependentes reconciliam.", "4. Perfil sem grant e AAL1 em escrita sensível são recusados pelo servidor.", "5. Documento/indicador/notificação corresponde a dados reais e ao filtro/contexto activo.", "6. Desktop e mobile aplicáveis são utilizáveis por teclado; limitações reais ficam explicitadas.", "", "## Testes, riscos e decisões pendentes", "", "Testes existentes inventariados (a presença do ficheiro não afirma execução nesta evolução):", ""]
    text += ["- " + link(p) for p in tests] or ["- Sem suite específica nesta pasta; testar o contrato do domínio responsável e criar regressão quando houver defeito relevante."]
    text += ["", "**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.", "", "## Fontes e navegação", ""]
    text += ["- " + link(p) for p in routes]
    text += ["- " + link(p.relative_to(ROOT)) for p in sources if p.name in {"server.ts", "schemas.ts"}]
    text += ["", "[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)", ""]
    (OUT / f"{module}.md").write_text("\n".join(text))
    index.append(f"| {title} | [{module}](modules/{module}.md) | Parcial; ver provas e bloqueios |")
    coverage.append({"modulo":module,"spec":f"modules/{module}.md","estado_codigo":"Implementado; lacunas e correcções descritas na SPEC","estado_validacao":"Parcialmente verificado","funcoes":len(contracts),"tabelas_confirmadas":len(known),"testes_inventariados":len(tests),"pendencia":"Aceitação integrada em staging e decisões documentadas"})

index += ["", "## Aplicações e operação", "", "- [WEB, ADMIN, PAYFLOW e DOC](ECOSSISTEMA_APPS.md)", "- [Desktop, PWA e offline](DESKTOP_PWA.md)", "- [Jornada anual e gates de publicação](JORNADA_INTEGRADA.md)", "- [Biblioteca, capelania e lacunas de âmbito](LACUNAS_E_DECISOES.md)", "", "## SPECs temáticas anteriores", ""]
for p in sorted((ROOT / "docs/specs").glob("*.md")):
    if p.name.startswith(("SGA_", "SIGA_", "motor-")): index.append(f"- [{p.name}]({p.name}) — conservar a data/contexto próprios; o índice não transforma proposta em implementação.")
(ROOT / "docs/specs/README.md").write_text("\n".join(index)+"\n")
for name, rows in [("matriz-evolucao.csv",coverage),("contratos-api.csv",api_rows)]:
    with (ROOT/"docs/specs"/name).open("w",newline="",encoding="utf-8-sig") as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print(json.dumps({"module_specs":len(coverage),"api_contracts":len(api_rows),"modules":list(META)},ensure_ascii=False))
