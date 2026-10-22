# Temas e personalização do website escolar

Em Definições → Website, o administrador pode escolher Campus, Editorial ou Essencial, instalar um pacote compatível, personalizar a apresentação e pré-visualizar um rascunho em computador ou telemóvel. Os campos de conteúdo existentes continuam disponíveis no mesmo editor.

## Publicação

- Aplicar um tema mantém os textos, imagens, cursos e ligações guardados. As personalizações globais e por página também são mantidas ao trocar de tema; utilize Repor para herdar novamente as opções do tema.
- Guardar conserva um rascunho; Publicar torna o rascunho disponível pela API pública da escola. Restaurar recupera a última publicação, incluindo o tema e os conteúdos.
- A instalação adiciona um tema ao catálogo do rascunho. É necessário aplicá-lo e publicar. Um tema activo não pode ser removido antes de escolher outro.
- As publicações anteriores, sem design configurado, conservam o aspecto anterior. O portal académico autenticado mantém o seu próprio desenho.

## Opções

As opções estão agrupadas, podem ser definidas globalmente ou por página pública e incluem reposição independente por secção:

- **Cores e fundos:** página, secções, títulos, texto, botões e rodapé.
- **Cabeçalho e identidade:** sólido, translúcido ou tingido, posição fixa ao navegar ou acompanhando a página, altura, barra de atalhos, marca contextual/completa ou textual e estilos dos submenus.
- **Tipografia e texto:** fontes do dispositivo (sistema, humanista ou editorial), títulos, peso, tamanho, alinhamento, entrelinha, largura de leitura, sublinhado e espaçamento dos títulos. Estes controlos afectam o website público, preservando a tipografia do SIGA.
- **Estrutura:** largura, espaço entre secções, cantos, cartões planos/elevados/com contorno e painéis sólidos/translúcidos.
- **Imagens e faixas:** fotografias limpas/com moldura, formas rectas/arredondadas/em arco, proporções horizontal/vertical, faixas sólidas/em gradiente/diagonais/sobrepostas, ornamentos e movimento de fundo.
- **Botões e ligações:** preenchimento/contorno/fundo suave, tamanho, cantos/cápsula, elevação/halo, indicadores e sublinhados. Os destinos e textos das acções existentes permanecem no editor de conteúdos; não são criadas novas operações académicas.
- **Rodapé:** disposição original, compacta ou centrada; fundo sólido ou em gradiente.
- **Movimento:** aparecimento, deslocamento, aproximação suave ou ausência de animações, e ritmos de 240/440/650 ms. O fundo animado pausa quando a página fica oculta e respeita movimento reduzido.

O modo textual da marca é uma escolha explícita do administrador e apresenta o nome da escola em lugar do símbolo/imagem. No modo institucional, a identidade carregada pela escola tem prioridade sobre a marca demonstrativa. Os pacotes v1 anteriores continuam aceites: as novas opções em falta recebem `original`, sem alterar a composição guardada.

A pré-visualização usa os textos do rascunho, os nomes dos cursos associados e o logótipo da escola. É estática, isolada num iframe sem permissões: não executa scripts, navegação ou operações de candidatura. Os efeitos podem ser verificados no website publicado. A preferência do visitante por movimento reduzido tem prioridade.

## Encontrar opções e conferir o rascunho

A pesquisa ignora acentos e aceita combinações como `botões cápsula`. O filtro de opções personalizadas mostra apenas as substituições do âmbito seleccionado, e as secções com alterações recebem uma indicação. Cada cor pode voltar à herança individualmente. Nos selectores, `Herdar` mostra o valor do tema para ajustes globais, ou o valor geral para ajustes de uma página. Repor uma secção remove todas as suas substituições, mesmo com filtros activos.

Ao escolher uma página para personalizar, essa página fica também seleccionada para a pré-visualização. Os tamanhos disponíveis são computador (1280 px), tablet (820 px) e telemóvel (até 390 px). A prévia mostra o fundo escolhido e a taxa de candidatura configurada. A marca demonstrativa é carregada como imagem PNG incorporada na prévia, preservando o isolamento do iframe; o ficheiro estático é reutilizado na sessão e pode ser novamente pedido após uma falha. Alterações nos conteúdos, tema, identidade, cursos associados ou página seleccionada marcam a prévia existente como desactualizada, até utilizar novamente Pré-visualizar rascunho. Alterar filtros ou o tamanho da janela não modifica o rascunho nem publica alterações.

## Reutilizar a aparência entre páginas

A lista Páginas personalizadas permite abrir directamente as páginas que têm ajustes próprios. Dentro da personalização de uma página, escolha uma origem e utilize Copiar personalizações. **Juntar** mantém os ajustes exclusivos do destino e dá prioridade aos valores copiados nas opções em comum. **Substituir** usa apenas os ajustes explícitos da origem. A configuração resultante é validada, incluindo o contraste, antes de alterar o rascunho.

A cópia afecta apenas o estilo do destino. Os conteúdos, cursos associados, tema geral e restantes páginas mantêm a sua configuração. Desfazer cópia repõe os ajustes anteriores do destino enquanto a configuração visual permanece igual à resultante dessa cópia; uma alteração visual posterior invalida esse atalho. Guardar/Publicar continuam explícitos. Não é possível copiar de/para o portal, a página 404 ou a própria origem.

O atalho Editar textos e imagens desta página abre o grupo correspondente no editor de conteúdos, limpa o filtro de campos e leva o foco ao selector da página, preservando o rascunho.

## Rever e recuperar alterações visuais

Desfazer ajuste visual e Refazer ajuste visual conservam até 20 alterações nesta sessão do editor, incluindo temas, opções e cópias entre páginas. As operações preservam os textos e cursos do rascunho actual. Uma nova edição depois de desfazer limpa o refazer. Uma configuração substituída externamente invalida a sequência anterior; a troca de escola e o recarregamento começam outra sessão. Num rascunho sem tema configurado, desfazer a primeira escolha recupera exactamente esse estado anterior.

Quando existe uma publicação, Versão para comparar permite gerar e alternar entre Rascunho actual e Última publicação. Cada versão conserva a sua prévia mais recente para a página escolhida e indica quando precisa de ser gerada novamente. A comparação usa os textos e estilos da versão seleccionada e a identidade/cursos associados actuais da escola. Alternar versões não publica, não restaura conteúdos e não muda os ajustes do rascunho. As prévias permanecem isoladas e sem operações activas.

O aviso de alterações por guardar é activado e retirado com o estado confirmado do editor, incluindo no blog, para não continuar a pedir confirmação depois de guardar.

## Instalação de temas

Formato JSON `siga-school-theme`, versão 1, até 32 KB e oito temas próprios por escola. Não se trata de um instalador de temas PHP/ZIP do WordPress. Os pacotes seleccionam os layouts suportados e opções de apresentação; não executam JavaScript, CSS livre, HTML ou plugins.

Exemplos compatíveis são gerados em `/themes/campus.json`, `/themes/editorial.json` e `/themes/minimal.json`. O botão Exportar modelo guarda a aparência global actual como pacote reutilizável. O pacote não inclui conteúdos escolares nem opções específicas por página.

Cada pacote contém `format`, `version`, `id` começado por `custom-`, `name`, `description` e `appearance`. As cores são hexadecimais de seis dígitos, e os restantes valores pertencem às opções suportadas. As combinações de texto/fundo, títulos/fundo, texto/botões e rodapé são verificadas com contraste mínimo 4,5:1; isto não substitui uma auditoria completa de acessibilidade da escola.

A configuração continua em `school_settings.value`, no domínio existente `school_website`, com as mesmas permissões, revisão optimista e auditoria. Não requer migração. A resposta pública contém apenas a aparência activa e opções das páginas; os pacotes instalados e rascunhos permanecem privados. A configuração pública é aplicada no HTML inicial e no runtime da escola.

## Verificação

O contrato mantém 66 páginas e 4653 campos editáveis, versão `96cb157ddf38b2059299`. Os testes cobrem instalação, rejeição de pacotes inválidos, conteúdos preservados, rascunho/publicação/restauro, isolamento entre escolas, renderização inicial e pré-visualização. Os três temas base foram verificados em 390/1440 px no ciclo anterior. As novas opções foram combinadas em dois perfis e verificadas em Chromium em 390/820/1440 px, nas páginas inicial, curso, ingresso e candidatura (24 vistas), incluindo marca textual, movimento reduzido, prévia móvel e reposição de secções no editor isolado. A publicação do site demonstrativo não substitui o deploy do SIGA que disponibiliza o novo painel administrativo.
