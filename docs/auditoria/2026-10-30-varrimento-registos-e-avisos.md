# Varrimento dos registos e dos avisos de segurança — 30/10/2026

Feito depois de o erro `99034DE7` revelar um ramo que falhava desde sempre sem
ninguém reparar. A pergunta era: **haverá outros?**

Fonte: registos do projecto `xodgfmxiaunpamctfeea` (últimas 24h) e os avisos do
linter do Supabase. Tudo em leitura; nada foi alterado na produção.

## 1. Pedidos que não devolveram sucesso

| Caminho | Estado | Nº | Veredicto |
| --- | --- | --- | --- |
| `auth/v1/user`, `jwks.json`, `tenant_domains` | 522 | 53 | Tempo-limite da Cloudflare, infra-estrutura. Não é código. |
| `auth/v1/token` | 400 | 11 | Entradas falhadas. Normal. |
| `auth/v1/factors` | 422 | 2 | **Ver §2.** |
| `academic_levels` | 400 | 1 | O erro `99034DE7`, corrigido em `5bce0b81`. |
| `rpc/register_payment` | 403 | 1 | Permissão recusada; uma ocorrência, sem padrão. |
| `class_subject_teacher_periods`, `tabela_que_nao_existe_xyz` | 400/404 | 2 | **Sondas de verificação**, feitas com `curl` e nomes propositadamente inexistentes. Não são defeitos. |
| vários `rest/v1/...` | 401 | 6 | Pedidos sem sessão válida. Esperado. |

**Só um dos erros era defeito de código**, e já está corrigido.

## 2. As chaves de acesso não estão activas no servidor

Às 17:04 de 30/10, em produção (`portal-siga.com`), duas tentativas de inscrever
uma chave de acesso falharam com:

```
422: MFA enroll is disabled for WebAuthn
error_code: mfa_webauthn_enroll_not_enabled
```

**Não é defeito de código.** `verification.ts:83` já apanha este caso e responde
em português: «As chaves de acesso ainda não estão activas neste servidor. Use o
código da aplicação autenticadora.»

É uma **lacuna de configuração**: a aplicação oferece a inscrição por chave de
acesso e o projecto tem essa via desligada. Resolve-se no painel do Supabase, em
Authentication, não no repositório. Fica por decisão do proprietário, por ser
definição de segurança.

## 3. Avisos do linter: 108 achados, zero acções

### 3.1. «RLS activo sem política» — 90 achados, nível INFO

**Não são para corrigir, e corrigi-los abriria o que está fechado.** Nesta
arquitectura a aplicação lê por `service_role` (que ignora RLS) e o RLS serve de
defesa da API: uma tabela com RLS activo e **nenhuma** política está fechada a
quem chega pela API pública. Acrescentar políticas seria abrir portas.

Ver [`apertar-rls-sao-duas-perguntas`] no registo de decisões: são duas
perguntas distintas, e esta é a que já está respondida.

### 3.2. «Função SECURITY DEFINER chamável por autenticados» — 18, nível WARN

Verificadas uma a uma. **Todas as 18 fixam `search_path`.** Só duas alteram
dados:

| Função | Guarda |
| --- | --- |
| `merge_school_subjects` | Sessão + **2FA activo** (`is_aal2`) + `has_permission(escola, 'academic.subjects.manage')` + valida que as disciplinas são daquela escola + limite de 20 + `FOR UPDATE`. |
| `hr_redeem_teacher_qr_secure` | Sessão + token de 32+ caracteres + geovalidação que pode recusar. O token é de uso único, bloqueado e com validade. |

As outras 16 são predicados de leitura sobre quem chama (`is_school_admin`,
`current_school_id`, …): devolvem um booleano sobre a própria sessão.

Detalhe que fecha a questão: **`hr_redeem_teacher_qr`, a função crua que escreve
a presença, não é executável nem por `authenticated` nem por `anon`.** Só o
invólucro `_secure` está exposto, e é ele que acrescenta a geovalidação.

**Veredicto: o aviso é falso positivo neste projecto.** A guarda está dentro de
cada função, não no `GRANT`.

### 3.3. Protecção de passwords comprometidas — 1, nível WARN

Exige plano Pro. Inaccionável no plano actual, não é um interruptor esquecido.

## 4. O que fica por fazer

- Activar WebAuthn no painel do Supabase, se as chaves de acesso forem para ser
  oferecidas (§2). É decisão e acção do proprietário.
- O `403` em `register_payment` teve **uma** ocorrência: sem padrão, não dá para
  distinguir de uma tentativa legítima recusada. Fica registado caso se repita.

## 5. Limite

24 horas de registos, uma escola activa. Um defeito que só se manifeste noutro
percurso, noutra escola ou fora desta janela não aparece aqui. O método, esse,
repete-se: os registos dizem o que falhou **mesmo**, e foi assim que o ramo do
pré-escolar apareceu depois de meses invisível.
