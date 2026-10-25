# Desktop, PWA e offline

08/10/2026. **Implementado:** frontend `desktop/`, Tauri v2 `src-tauri/`, capabilities/CSP, contrato de versões e testes locais; PWA/service worker do SIGA quando configurado. Auditoria: 40 testes desktop e build frontend passaram, sem pacote Rust/instalação nativa testados. Novas alterações não dizem que estas provas cobrem offline real.

## Objectivo, perfis e dependências

Dar acesso ao mesmo contexto escolar e permissões do SIGA. Nenhum papel adicional por estar no desktop. Depende de autenticação/MFA, origem autorizada, rede e versão compatível. Instalação/updater exigem artefacto assinado e chaves de distribuição; não inventar release inexistente.

## Fluxos, estados e contratos

Arrancar → verificar origem/configuração → autenticar → escolher escola → operar → descarregar/imprimir → terminar sessão. Alternativas: rede indisponível, sessão expirada, origem errada, download bloqueado, versão incompatible e recuperação de arranque. Campos/configuração vêm de `desktop/src`, `src-tauri/tauri.conf.json` e capabilities existentes. Tokens não são parâmetros de URL e segredos não entram no frontend.

**Proposto:** ensaiar Windows/macOS com artefacto real, assinatura e updater; PWA instalação/cache/actualização; impressão/downloads por perfil. **Por decidir:** quais operações são suportadas offline, retenção permitida, resolução de conflitos e requisitos institucionais de dispositivo partilhado. Não anunciar escrita offline com sincronização se não houver contrato e persistência comprovados.

## Isolamento, UX e aceitação

Troca de escola/logout limpa contexto e caches sensíveis; fila offline, se suportada, pertence a escola/actor e volta a autorizar ao sincronizar. Conflito não é resolvido por última escrita silenciosa. Capabilities permitem apenas comandos/origens necessários. Interface respeita foco/teclado, tamanhos de janela e movimento reduzido.

Aceitação: pacote instala/arranca; login/MFA/alternância/logout correctos; downloads/impressões com dados autorizados; perda/retoma de rede sem duplicação; updater verificável/reversível; A/B não mistura cache/fila. Estados vazio/loading/sucesso/falha fiéis à operação real. Evidências locais não certificam os critérios nativos pendentes.

[Índice](README.md) · [Jornada](JORNADA_INTEGRADA.md)
