-- Catálogo de módulos no vocabulário actual, e o estado por escola a valer.
--
-- O `module_catalog` descrevia a geração de Agosto: oito códigos grosseiros
-- (`academic`, `assessment`, `attendance`, `communication`, `documents`,
-- `finance`, `identity`, `reports`) cujos manifestos declaravam rotas que **não
-- existem** na aplicação — `/academico`, `/avaliacao`, `/presencas`,
-- `/comunicacao`, `/secretaria`, `/utilizadores`, `/validar`. Sete de dez. Era
-- por isso que nada em `src/` o lia: não havia nada de útil a ler.
--
-- Esta migração reescreve-o com os 18 módulos que a aplicação tem hoje,
-- gerados a partir de `scripts/siga/modules.json`
-- (`tests/security/catalogo-de-modulos.test.ts` impede a deriva entre os dois).
--
-- As 8 linhas de `school_modules` que existiam usavam os códigos antigos e eram
-- ignoradas pela aplicação — códigos desconhecidos caem na omissão do produto.
-- Apagá-las **não muda nada** do que alguma escola vê hoje, e deixa a tabela a
-- dizer a verdade: sem linha, vale a omissão.
--
-- Para ligar um módulo adormecido numa escola (o caso que motivou isto, um
-- piloto de RH numa escola sem o mostrar às outras):
--
--   insert into public.school_modules (school_id, module_code, status, installed_version)
--   values ('<uuid da escola>', 'rh', 'active', '1.0.0');
--
-- E para desligar um que o produto dá ligado, a mesma linha com `'disabled'`.

begin;

-- Primeiro as linhas por escola, que referenciam o catálogo pela chave estrangeira.
delete from public.school_modules;
delete from public.module_catalog;

insert into public.module_catalog (code, name, version, is_essential, manifest) values
  ('dashboard', 'Dashboard', '1.0.0', false, '{"navPath": "/portal", "secondaryNavPaths": [], "skill": "siga-dashboard", "defaultEnabled": true}'::jsonb),
  ('alunos', 'Alunos / matrículas internas', '1.0.0', false, '{"navPath": "/alunos", "secondaryNavPaths": [], "skill": "siga-alunos", "defaultEnabled": true}'::jsonb),
  ('alumni', 'Alumni / antigos alunos', '1.0.0', false, '{"navPath": "/alumni", "secondaryNavPaths": [], "skill": "siga-alumni", "defaultEnabled": false, "dormantReason": "Zero registos em produção a 25/10/2026. Desligado por omissão em todas as escolas; uma escola pode ligá-lo com uma linha em school_modules (status active)."}'::jsonb),
  ('pessoas', 'Pessoas e professores', '1.0.0', false, '{"navPath": "/pessoas", "secondaryNavPaths": [], "skill": "siga-pessoas", "defaultEnabled": true}'::jsonb),
  ('pedagogica', 'Área pedagógica / turmas', '1.0.0', false, '{"navPath": "/pedagogica", "secondaryNavPaths": ["/relatorios/academicos"], "skill": "siga-pedagogica", "defaultEnabled": true}'::jsonb),
  ('financeiro', 'Tesouraria e faturas', '1.0.0', false, '{"navPath": "/financeiro", "secondaryNavPaths": ["/faturas", "/relatorios/financeiros", "/financeiro/rh"], "skill": "siga-financeiro", "defaultEnabled": true}'::jsonb),
  ('rh', 'RH, assiduidade e folha salarial', '1.0.0', false, '{"navPath": "/financeiro/rh", "secondaryNavPaths": ["/financeiro/rh/folha", "/financeiro/rh/faltas", "/financeiro/rh/presenca", "/financeiro/rh/pagamentos"], "skill": "siga-rh", "defaultEnabled": false, "dormantReason": "Zero registos em produção a 25/10/2026. Desligado por omissão em todas as escolas; uma escola pode ligá-lo com uma linha em school_modules (status active)."}'::jsonb),
  ('documentos', 'Documentos', '1.0.0', false, '{"navPath": "/documentos", "secondaryNavPaths": [], "skill": "siga-documentos", "defaultEnabled": true}'::jsonb),
  ('calendario', 'Calendário e ICS', '1.0.0', false, '{"navPath": "/calendario", "secondaryNavPaths": [], "skill": "siga-calendario", "defaultEnabled": true}'::jsonb),
  ('comunicacoes', 'Comunicações', '1.0.0', false, '{"navPath": "/comunicacoes", "secondaryNavPaths": [], "skill": "siga-comunicacoes", "defaultEnabled": true}'::jsonb),
  ('acessos', 'Acessos, grants e 2FA', '1.0.0', false, '{"navPath": "/acessos", "secondaryNavPaths": [], "skill": "siga-acessos", "defaultEnabled": true}'::jsonb),
  ('matricula', 'Matrícula pública', '1.0.0', false, '{"navPath": "/configuracoes", "secondaryNavPaths": [], "skill": "siga-matricula", "defaultEnabled": true}'::jsonb),
  ('integracoes', 'Integrações catalog-ready', '1.0.0', false, '{"navPath": null, "secondaryNavPaths": [], "skill": "siga-integracoes", "defaultEnabled": true}'::jsonb),
  ('arquivos', 'Arquivos', '1.0.0', false, '{"navPath": "/arquivos", "secondaryNavPaths": [], "skill": "siga-arquivos", "defaultEnabled": true}'::jsonb),
  ('lesson-plans', 'Planos de Aula', '1.0.0', false, '{"navPath": "/planos-aula", "secondaryNavPaths": [], "skill": "siga-lesson-plans", "defaultEnabled": true}'::jsonb),
  ('importar', 'Motor Central de Importação', '1.0.0', false, '{"navPath": "/importar", "secondaryNavPaths": [], "skill": "siga-importar", "defaultEnabled": true}'::jsonb),
  ('catracas', 'Catracas e Cartão Virtual', '1.0.0', false, '{"navPath": "/catracas", "secondaryNavPaths": [], "skill": "siga-catracas", "defaultEnabled": false, "dormantReason": "Zero registos em produção a 25/10/2026. Desligado por omissão em todas as escolas; uma escola pode ligá-lo com uma linha em school_modules (status active)."}'::jsonb),
  ('saas', 'SaaS Control Center (plataforma)', '1.0.0', false, '{"navPath": null, "secondaryNavPaths": [], "skill": "siga-saas", "defaultEnabled": true}'::jsonb);

commit;
