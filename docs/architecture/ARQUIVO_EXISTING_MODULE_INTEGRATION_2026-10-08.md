# Integração obrigatória com o módulo Arquivo existente

**Decisão de arquitectura (08/10/2026):** o SIGA Plus já dispõe de um módulo denominado **Arquivo**. Não criar módulo concorrente, nova navegação «Arquivos» ou estrutura paralela de ficheiros.

## Inspecção antes de alterar código
1. Identificar rotas, páginas, componentes, serviços, tabelas, buckets, políticas e operações do módulo Arquivo existente.
2. Inventariar contratos de upload, download, listagem, pastas, pesquisa, partilha, eliminação, anexação e visualização.
3. Verificar como se ligam os documentos a escola, utilizador, aluno, professor, mensagem e demais entidades.
4. Reutilizar o backend existente sempre que cumprir as regras de autorização; propor migrações apenas para lacunas demonstradas.

## Integração
- O selector universal é uma **janela de escolha**, não um módulo separado.
- Opção «Do dispositivo»: selector nativo; carregar para o Arquivo conforme a política do contexto.
- Opção «Do Arquivo»: pesquisar e escolher ficheiros aos quais o utilizador tem acesso efectivo.
- Separar escopos: públicos explicitamente publicados, da escola, meus ficheiros e partilhados comigo.
- Permitir vincular ficheiro existente a uma entidade sem copiar conteúdo, desde que autorizado.
- Para trocar fotografia, verificar se o ficheiro escolhido é uma imagem válida e se há permissão para alterar o perfil.
- O Arquivo mantém as operações de gestão; o selector oferece apenas as operações necessárias à tarefa.

## Restrições
- Nunca conceder acesso geral a ficheiros privados só porque estão visíveis no módulo Arquivo para um administrador.
- Aplicar filtros de tenant, escola, proprietário e partilha **no servidor** e nas políticas RLS/Storage.
- Não substituir contratos existentes nem fazer migrações destrutivas sem análise.
- Manter os nomes e rotas actuais do módulo Arquivo.

## Próximo passo verificável
Localizar os ficheiros reais do módulo Arquivo, documentar os seus contratos e integrar inicialmente um único fluxo (fotografia de perfil ou anexo de mensagem), com testes automatizados. Só depois expandir aos restantes módulos.
