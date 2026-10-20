# Referências universitárias e lacunas do ISPAB

Consulta: 20 de Outubro de 2026. Comparação de organização, orientação e percursos; sem reprodução de identidade ou textos. Os exemplos de outras instituições não comprovam a existência dos mesmos serviços no ISPAB.

## Referências oficiais

- [Oxford — Admissions](https://www.ox.ac.uk/admissions): organiza a informação por etapa e perfil de candidato, com caminhos para candidatura, financiamento e candidatos internacionais.
- [UNASP — Futuros alunos](https://unasp.br/servicos/futuros-alunos/): aproxima descoberta de cursos, transferências, bolsas e experiência no campus; oferece também conteúdos para apoiar a decisão de formação.
- [MIT — Education](https://www.mit.edu/education/): liga formação a recursos académicos, orientação do primeiro ano, apoio ao estudante e aprendizagem aberta.
- [Harvard](https://www.harvard.edu/): dá visibilidade à organização académica, investigação, recursos, comunidade e informação institucional.

## Cobertura e alterações

| Necessidade | Situação encontrada | Refinamento |
| --- | --- | --- |
| Descoberta de cursos | Catálogo, filtros, fichas, favoritos e comparação já disponíveis | Preservados |
| Preparação antes da candidatura | Lista informativa breve no ingresso | Guia `/preparar-candidatura/` com seis tarefas pessoais, progresso local, reposição com confirmação e exportação de texto |
| Transferências e habilitações estrangeiras | Transferência mencionada, sem orientação própria | Guia `/percursos-de-ingresso/` com perguntas sobre reconhecimento, documentação, análise e canais seguros |
| Transição após a admissão | Portal e serviços separados, sem percurso de acolhimento | Guia `/novos-estudantes/` com matrícula, acessos, primeira semana, estudo e apoio |
| Apoios e recursos abertos | Bolsas, apoio ao estudante, acessibilidade, biblioteca, carreiras | Guias ligam aos recursos existentes |
| Encontrabilidade | Menus, pesquisa e mapa do site | Novos guias integrados nos menus, rodapé, pesquisa e mapa; transferência ligada ao novo guia |
| Dados pessoais | Controlo de exportação e eliminação local | Lista de preparação incluída nesses controlos; só guarda identificadores de tarefas |

## Informação oficial em falta para lançamento institucional

Estas lacunas exigem conteúdo fornecido e validado pelo ISPAB. Não foram preenchidas com informações de outras escolas:

1. Nome legal completo, história, direcção, órgãos, estatutos e contactos institucionais.
2. Licenciamento/acreditação, entidade competente e documentos comprovativos.
3. Oferta real: cursos autorizados, planos, cargas horárias, corpo docente, unidades e turnos.
4. Editais de ingresso, vagas, requisitos, provas, critérios, resultados e calendário real.
5. Propinas, taxas, regras de pagamento, cancelamento/reembolso e bolsas efectivas.
6. Regulamentos académicos, avaliação, reclamações e canais de atendimento responsáveis.
7. Endereço, acessibilidade física, fotografias próprias, mapa e condições de visitas.
8. Projectos, parcerias, publicações e testemunhos reais com autorização.
9. Política de privacidade institucional e responsáveis pelo tratamento de dados reais.
10. URL do SIGA Plus, campanha válida, origens autorizadas e confirmação dos canais oficiais antes de activar a integração.

Até à validação, os guias são orientações gerais; a demonstração não recebe documentos nem submete candidaturas reais. O progresso da preparação não representa elegibilidade, candidatura ou admissão.

## Validação

Build e verificação de 65 páginas, ligações, metadados e identificadores nos dois projectos. Verificação no Chromium em 320, 768, 1024 e 1440 px, pesquisa e navegação móvel; fluxos da lista, persistência, descarregamento, reposição, dados inválidos, exportação e eliminação de dados. Sem alterações ao backend ou contrato da API.

## Continuação: decisão e planeamento

Duas referências adicionais consultadas em 20 de Outubro de 2026:

- [Oxford — Living costs](https://www.ox.ac.uk/admissions/undergraduate/fees-and-funding/living-costs): distingue despesas da formação e despesas de vida, e organiza o planeamento por meses. Não foram usados preços, moedas ou estimativas de Oxford no ISPAB.
- [Oxford — Choosing what to study](https://www.ox.ac.uk/admissions/undergraduate/courses/choosing-what-to-study): reforça a exploração dos interesses e a leitura da estrutura e dos conteúdos do curso antes de escolher. O guia ISPAB apresenta perguntas de reflexão e não atribui um perfil vocacional.

Alterações:

- `/escolher-curso/`: interesses, aprendizagem e rotina; liga às seis áreas existentes, ao comparador e à preparação de perguntas. A escolha fica com o visitante.
- `/planear-custos/`: estimativa pessoal em Kz. Calcula propina por prestação × número de prestações, despesas mensais × meses e despesas únicas. Os dois períodos são independentes e todos os valores são introduzidos pelo visitante. Não guarda nem envia dados, não publica preços oficiais e não gera pagamentos.
- Pesquisa: passa a indexar também o conteúdo estático das páginas públicas, sem menu ou rodapé, para encontrar termos que não constam do título. O índice é carregado apenas ao abrir a pesquisa. Conteúdo privado do portal e dados locais continuam excluídos.
- Navegação: guia de escolha no menu Estudar; planeador nas orientações de bolsas, na lista de preparação e no guia de escolha. Mapa e pesquisa incluem ambos.

Verificação adicional: aritmética decimal e limites de valores/períodos; no browser, campos vazios, períodos diferentes, total exacto, exportação de texto, ausência de armazenamento, invalidação após alteração, valores negativos, zero e reposição. Pesquisa por palavras presentes apenas no corpo das páginas; passagem de uma área do guia para o catálogo filtrado. As 65 páginas foram verificadas em 320, 768, 1024 e 1440 px, sem transbordamento horizontal ou erros de JavaScript.
