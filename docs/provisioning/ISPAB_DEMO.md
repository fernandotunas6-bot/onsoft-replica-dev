# ISPAB de demonstração

A demonstração usa o provisionamento SIGA existente, com o slug `ispab`, nome
`ISPAB (Demonstração)`, NIF `DEMOISPAB2026` e e-mail reservado
`ispab-admin@example.invalid`. A localização Benguela e a morada são fictícias.
O contexto pedagógico é Ensino Superior. Os dados institucionais são editáveis
nas Definições da escola; a substituição do e-mail de acesso usa a gestão de
administradores existente.

O workflow `provision-ispab-demo.yml` verifica os ficheiros em push e só consulta
ou cria a escola por execução manual no ambiente GitHub `production`. A opção
por omissão é `preflight`; `create` executa o cadastro após verificar duplicações,
o plano inicial e o projecto de destino. Um registo existente interrompe a
operação, sem redefinir credenciais ou vínculos.

A cobrança é pausada sem data de retoma e o tenant recebe a isenção correspondente.
O domínio `demo` de `school_settings` identifica os campos fictícios. Os registos
de provisionamento e pausa ficam na auditoria SaaS.

A palavra-passe é aleatória. O proprietário fornece apenas uma chave pública
RSA 4096 em base64; a chave privada permanece fora do GitHub. O artefacto de acesso
usa RSA-OAEP/SHA-256 e expira ao fim de um dia. O workflow não recebe credenciais
de correio nem de alertas externos. O e-mail `.invalid` não recebe mensagens.

Cadastro executado em 2026-10-21 pelo workflow `39582520942`, com confirmação em
produção da conta administrativa, membership, papel, estrutura e cobrança pausada.
O portal responde em `https://ispab.portal-siga.com/`. A publicação do novo website
depende ainda da correcção da credencial Cloudflare do ambiente de produção.
