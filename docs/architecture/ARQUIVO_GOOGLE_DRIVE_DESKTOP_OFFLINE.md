# SIGA Plus — Arquivo, Google Drive pessoal e desktop offline

Estado: especificação técnica; **Google Drive ainda não está implementado**. Não mostrar "ligado" ou "sincronizado" antes de confirmar o estado no servidor.

## 1. Destinos distintos

- **Escola (siga-files):** fonte de verdade para documentos institucionais, contratos, BI, certificados, pautas e outros documentos sujeitos a retenção e auditoria.
- **Google Drive do utilizador:** cópia/exportação opcional e explícita, mediante consentimento OAuth Google Drive, nunca inferido da verificação de Gmail. Não utilizar Drive pessoal como única cópia de documentos institucionais.
- **Desktop local:** cache e fila offline para ficheiros permitidos, com estado visível `local`, `pendente`, `a sincronizar`, `sincronizado` ou `erro`. Dados locais não são backup remoto.

## 2. Ligação segura do Google Drive

1. O utilizador autenticado escolhe **Ligar Google Drive** em Conta > Integrações. Mostrar qual conta Google será usada, quais permissões e a opção Desligar.
2. Backend inicia OAuth 2.0 com PKCE e `state` associado à sessão e com expiração curta. O retorno valida `state`, utilizador, redirecionamento e conta Google.
3. Pedir apenas o scope `https://www.googleapis.com/auth/drive.file` para ficheiros criados/selecionados pela aplicação. Nunca solicitar Gmail scope para esta funcionalidade, nem a palavra-passe Google.
4. Guardar tokens exclusivamente no backend, cifrados em repouso, por utilizador/conta; refresh token nunca enviado ao browser, logs, IndexedDB ou Tauri. Implementar rotação/revogação e reconexão quando expirar.
5. Selecionar ficheiros existentes com Google Picker e permissões adequadas, ou enviar cópia do Arquivo para pasta SIGA Plus no Drive. Exibir progresso, identificador remoto, resultado e eventual falha.
6. Separar ligação de conta Google para login/verificação de e-mail da autorização Drive. Nunca presumir que o Gmail verificado concedeu consentimento Drive.
7. No upload de documentos privados, a exportação deve exigir autorização da política da escola, confirmação explícita e trilho de auditoria. Não exportar automaticamente dados de alunos/funcionários para contas pessoais.
8. Ao desligar, revogar tokens e impedir novos envios; explicar que cópias já existentes no Drive não são eliminadas automaticamente.

## 3. Desktop/PWA inspirado no WhatsApp

- Guardar ficheiros offline autorizados em armazenamento local privado e cifrado quando a plataforma o suportar; separar por escola e conta.
- Outbox idempotente com UUID, hash, retries com backoff, verificação de tamanho/MIME, confirmação de upload e de registo no servidor.
- Não marcar `sincronizado` antes da confirmação do servidor; limpar cache só após confirmação e conforme política de retenção.
- Mostrar consumo de espaço, ficheiros apenas locais, conflitos e botão **Tentar novamente**.
- Em Tauri, usar armazenamento seguro do sistema para segredos e armazenamento de ficheiros com protecção apropriada; nunca embutir credenciais administrativas.
- A abordagem WhatsApp de sincronização e cache é referência de experiência, **não** licença para tratar armazenamento local como backup ou replicar criptografia sem desenho e revisão próprios.

## 4. Contratos propostos (não implementados)

- `POST /api/drive/connect`: criar tentativa OAuth associada à sessão.
- `GET /api/drive/callback`: validar consentimento e persistir credenciais cifradas.
- `GET /api/drive/status`: devolver apenas conta, scopes, ligação e última sincronização; nunca tokens.
- `POST /api/drive/export`: exportar ficheiro autorizado com idempotência, validação de escola e auditoria.
- `POST /api/drive/disconnect`: revogar e remover credenciais.
- Tabela de ligações por `user_id` e provider; tabela de exportações por `school_id`, `file_id`, `user_id`, destino e estado, com políticas RLS e auditoria.

## 5. Critérios de aceitação antes de produção

- Conta Gmail verificada sem OAuth Drive não permite acesso Drive.
- Trocar de escola ou utilizador não revela ficheiros/tokens do anterior.
- Revogação do Google, expiração do refresh token e cancelamento de consentimento são tratados.
- Documentos privados nunca são exportados sem permissão e consentimento explícito.
- Offline/online, reinício do desktop, conflitos, upload duplicado, falha a meio, quota cheia e limpeza de cache testados.
- Testes E2E em Windows/macOS/Linux, Android/PWA e browser; CI, migrações e revisão de segurança aprovadas.
- Sem estes critérios cumpridos, não activar a funcionalidade nem publicar a integração.
