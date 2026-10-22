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

## Instalação de temas

Formato JSON `siga-school-theme`, versão 1, até 32 KB e oito temas próprios por escola. Não se trata de um instalador de temas PHP/ZIP do WordPress. Os pacotes seleccionam os layouts suportados e opções de apresentação; não executam JavaScript, CSS livre, HTML ou plugins.

Exemplos compatíveis são gerados em `/themes/campus.json`, `/themes/editorial.json` e `/themes/minimal.json`. O botão Exportar modelo guarda a aparência global actual como pacote reutilizável. O pacote não inclui conteúdos escolares nem opções específicas por página.

Cada pacote contém `format`, `version`, `id` começado por `custom-`, `name`, `description` e `appearance`. As cores são hexadecimais de seis dígitos, e os restantes valores pertencem às opções suportadas. As combinações de texto/fundo, títulos/fundo, texto/botões e rodapé são verificadas com contraste mínimo 4,5:1; isto não substitui uma auditoria completa de acessibilidade da escola.

A configuração continua em `school_settings.value`, no domínio existente `school_website`, com as mesmas permissões, revisão optimista e auditoria. Não requer migração. A resposta pública contém apenas a aparência activa e opções das páginas; os pacotes instalados e rascunhos permanecem privados. A configuração pública é aplicada no HTML inicial e no runtime da escola.

## Verificação

O contrato mantém 66 páginas e 4653 campos editáveis, versão `96cb157ddf38b2059299`. Os testes cobrem instalação, rejeição de pacotes inválidos, conteúdos preservados, rascunho/publicação/restauro, isolamento entre escolas, renderização inicial e pré-visualização. Os três temas base foram verificados em 390/1440 px no ciclo anterior. As novas opções foram combinadas em dois perfis e verificadas em Chromium em 390/820/1440 px, nas páginas inicial, curso, ingresso e candidatura (24 vistas), incluindo marca textual, movimento reduzido, prévia móvel e reposição de secções no editor isolado. A publicação do site demonstrativo não substitui o deploy do SIGA que disponibiliza o novo painel administrativo.
