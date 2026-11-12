# Refinamento do ingresso e apresentação

A estrutura, tipografia e conteúdos existentes mantêm-se. A apresentação opcional
`prism` usa tons azul e roxo e gradientes discretos. A composição original das
fotografias mantém-se, conforme a correcção do cliente. O rodapé recebe um gradiente
escuro de azul e roxo; a barra lateral escura do SIGA recebe os mesmos tons.
O estilo `classic` mantém os destaques em azul discreto. Animações
respeitam o sistema, a preferência de acessibilidade do site e a visibilidade da página.
Nenhum campo do manifesto foi renumerado: mantêm-se os 4579 campos e a versão do modelo.

No portal, **Definições → Website** permite guardar/publicar a taxa de candidatura
em Kz e o estilo. São propriedades opcionais de `school_settings.school_website`,
compatíveis com publicações anteriores, sem migração de base de dados. O valor
informativo só sai pela API após publicação. Um formulário oficial só recebe a taxa
da publicação da sua escola e da campanha ligada. Não existe uma taxa global ISPAB
aplicada às outras escolas. Uma falha na leitura omite o valor.

A prévia ISPAB apresenta **24 000 Kz**, conforme indicado pelo cliente. Esse valor
é independente de propinas e não cria uma factura. Registos locais guardam a taxa
indicada na altura do resumo; os downloads continuam marcados DEMO. Dados locais
não passam a candidaturas reais. A candidatura oficial no SIGA ganha revisão,
confirmação explícita, correcção sem perder os dados e bloqueio de envios simultâneos.
O número de processo e o talão só aparecem após confirmação do servidor.

O login da prévia encaminha para o mesmo SIGA, com contexto `escola=ispab`.
Sites ligados continuam a usar o portal da própria escola. O Google/e-mail e a
verificação de segurança continuam no login existente, sem credenciais novas.
O fluxo externo de OAuth não foi executado com contas reais nesta verificação.

## Pagamento Express e notificações

A página pública do [Kursinha](https://kursinha.com/) e o seu bundle público foram
consultados em 21/10/2026. Foram encontradas referências genéricas a checkout;
não foi encontrado um contrato público verificável da integração Express.
O pagamento online permanece indisponível, com indicação ao candidato para
aguardar a secretaria. Não existe botão de pagamento fictício, cobrança,
redireccionamento para checkout não verificado ou estado `pago` criado no navegador.
Também não são enviados e-mails/SMS por esta alteração; a confirmação é mostrada
na página e o talão pode ser guardado. Os contactos institucionais existentes permanecem.

Para activar Express, falta obter a documentação/SDK oficial usado pelo Kursinha,
conta comercial da escola, credenciais de teste guardadas no servidor, callbacks
assinados e política de expiração/reconciliação. A implementação deverá calcular a
cobrança no servidor, vincular escola/candidatura/factura, usar idempotência e só
confirmar pagamento após verificação do prestador. Uma visita à URL de retorno
nunca é prova de pagamento. Notificações exigem um prestador já configurado pela
escola e confirmação real do envio, sem expor dados de alunos no website público.

## Referências e verificação

- [UNASP](https://unasp.br/) e [catálogo](https://unasp.br/cursos/): descoberta de
  cursos e orientação de ingresso; sem reprodução de imagens, marcas ou conteúdos.
- Poster fornecido pelo cliente: paleta e geometria adaptadas às imagens académicas
  existentes; nenhuma fotografia ou marca do poster foi reutilizada.
- Testes de publicação/rascunhos, edição administrativa, taxa por campanha,
  rejeição de valores inválidos, revisão/correcção, erro de envio e bloqueio de duplicados.
- Chromium local: início, login, ingresso, curso, vida académica e candidatura em
  360/390/768/1440 px; rascunho, revisão, confirmação DEMO, resumo descarregável,
  ausência de POSTs e movimento reduzido. Não representa teste em dispositivos físicos.
- Compilação e verificação dos 4579 campos, 66 páginas e ligações internas.

A publicação Sites é uma prévia privada. A aplicação SIGA em produção tem um fluxo
de implantação independente; não activar a cobrança antes da integração verificada.
