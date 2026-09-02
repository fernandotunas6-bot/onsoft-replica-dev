# Endurecimento de Segurança & Prevenção de Invasões

Diretrizes técnicas e normas de segurança da plataforma **SIGA Plus** para eliminação de vetores de ataque, proteção da infraestrutura, isolamento de dados e prevenção de acessos não autorizados.

---

## 1. Segurança de Servidor & Rede

Para evitar que a documentação ou a aplicação exponha portas abertas à rede externa sem proteção:

### Configuração de Escuta Local
Os servidores de desenvolvimento e documentação devem ser configurados para escutar exclusivamente na interface de loopback local (`127.0.0.1` ou `localhost`), prevenindo acessos indesejados pela rede local:

```bash
# Execução segura do servidor de documentação
npm run dev -- --host 127.0.0.1
```

### Cabeçalhos de Segurança HTTP (Security Headers)
Em ambientes de produção, os servidores Web (Nginx, Cloudflare, Vercel) devem aplicar rigorosamente os seguintes cabeçalhos de segurança:

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://central-admin.siga.plus;
```

---

## 2. Isolamento de Base de Dados (Multi-Tenant Row Level Security)

Para garantir que uma instituição cliente nunca aceda aos dados de outra, a base de dados PostgreSQL / Supabase impõe políticas estritas de **Row Level Security (RLS)** em todas as tabelas:

```sql
-- Ativar RLS na tabela de alunos
ALTER TABLE public.alunos ENABLE ROW LEVEL SECURITY;

-- Política de Leitura: O utilizador só acede a alunos da sua própria instituição
CREATE POLICY "Leitura de alunos por instituicao" 
ON public.alunos 
FOR SELECT 
USING (
  instituicao_id = (SELECT instituicao_id FROM public.utilizadores WHERE id = auth.uid())
);

-- Política de Modificação: Restrita a administradores e secretarias da instituição
CREATE POLICY "Modificacao de alunos por perfil autorizado" 
ON public.alunos 
FOR ALL 
USING (
  instituicao_id = (SELECT instituicao_id FROM public.utilizadores WHERE id = auth.uid())
  AND (SELECT role FROM public.utilizadores WHERE id = auth.uid()) IN ('ADMIN_INSTITUCIONAL', 'SECRETARIA')
);
```

---

## 3. Prevenção de Injeções (SQLi, XSS, CSRF)

### Prevenção de SQL Injection
- Todas as consultas utilizam parâmetros tipados via cliente Supabase ou ORM.
- Proibida a concatenação direta de strings em queries SQL.

### Proteção Contra XSS (Cross-Site Scripting)
- Validação e sanitização rigorosa de todas as entradas do utilizador com **Zod schemas** no servidor.
- Sanitização de conteúdos ricos (Rich Text / HTML) utilizando sanitizadores contextuais antes de renderizar no DOM.

### Proteção Contra CSRF (Cross-Site Request Forgery)
- Todos os cookies de sessão utilizam os atributos `HttpOnly`, `Secure` e `SameSite=Strict`.
- Endpoints de mutação requerem validação de tokens anti-CSRF ou verificação de cabeçalhos de origem (`Origin` / `Referer`).

---

## 4. Proteção de Autenticação & Mitigação de Força Bruta

Para impedir ataques de dicionário ou tentativas automatizadas de quebra de senhas:

- **Rate Limiting de Autenticação**: Bloqueio de IP / Conta após 5 tentativas falhadas num intervalo de 15 minutos.
- **Políticas de Senha Fortes**: Comprimento mínimo de 10 caracteres, exigindo maiúsculas, números e caracteres especiais.
- **Sessões Curta Duração**: Tokens JWT com expiração máxima de 1 hora e rotação de Refresh Tokens.

---

## 5. Comunicação Segura com Catracas & Pontes de Hardware

A comunicação entre a aplicação e os dispositivos de controlo de acessos físicos (Catracas eletrónicas via ponte Python/Tauri 2) é protegida contra interceptações e falsificação de acessos:

- **Assinatura de Pacotes (HMAC-SHA256)**: Cada evento de validação de cartão/biometria enviado pela catraca é assinado com uma chave secreta do dispositivo.
- **Timestamp & Nonce Anti-Replay**: Cada requisição inclui um carimbo de data/hora e identificador único (nonce) para impedir a repetição maliciosa de autorizações de entrada.
- **Validação Dupla**: O servidor valida se o aluno/funcionário tem a licença ativa e propinas em dia antes de responder com a instrução de liberação do relé da catraca.

---

## 6. Saneamento de Segredos (Zero Secret Leakage)

- **Ficheiros `.env`**: Nunca incluídos em controlo de versões (`.gitignore`).
- **Exemplos de Código**: Todos os ficheiros de documentação e testes utilizam estritamente identificadores fictícios de demonstração (`https://your-instance.supabase.co`, `your-secret-token`).
- **Rotação de Chaves**: Caso uma chave de acesso seja partilhada involuntariamente, a rotação deve ser efetuada imediatamente no painel de administração da infraestrutura.

---

## Checklist de Segurança para Implantação

- [x] Servidor de documentação configurado em escuta local restrita.
- [x] Políticas RLS aplicadas em todas as tabelas no banco de dados.
- [x] Cabeçalhos de segurança HTTP (CSP, HSTS, X-Frame-Options) ativos no servidor web.
- [x] Middleware de verificação de licença e papéis (RBAC) ativo em todas as rotas restritas.
- [x] Comunicação com catracas validada com assinatura de pacotes HMAC.
- [x] Nenhum segredo ou credencial real exposto no código público.
