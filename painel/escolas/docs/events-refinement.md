# Agenda e partilha de notícias — refinamento

20 de Outubro de 2026. Mantidos o visual, as 65 páginas, os eventos de exemplo e o carácter demonstrativo do website.

## Problemas e correcções

O ficheiro ICS exportado para o primeiro evento tinha linhas de até 167 bytes. O novo exportador dobra as linhas físicas em até 75 bytes UTF-8, sem cortar caracteres, e usa CRLF. Texto com vírgulas, ponto e vírgula, barras e quebras de linha é escapado para não se tornar uma nova propriedade do calendário.

A conversão de WAT (UTC+1) para UTC usa datas completas, incluindo a passagem para o dia ou ano anterior. Um intervalo que atravessa a meia-noite termina no dia local seguinte. Os três eventos existentes mantêm as horas e os identificadores de importação anteriores. As datas e as horas não dependem do fuso configurado no dispositivo.

Os botões públicos de descarga identificam o evento pelo nome para tecnologias de apoio. As datas da agenda e da publicação das notícias usam o elemento time, sem alterar o texto apresentado.

Quando a cópia de um link é recusada pelo navegador, a janela alternativa foca e selecciona o endereço, pronto para cópia manual. As janelas dinâmicas recebem um nome acessível a partir do seu título.

## Validação

- `scripts/check-calendar.mjs`, incluído em `npm run check` nos dois projectos: conversão WAT; meia-noite; passagem de ano; linhas UTF-8 de até 75 bytes; texto longo com acentos e emoji; escape de quebras de linha; rejeição de datas, horas, intervalos e identificadores inválidos; horários dos três eventos demonstrativos.
- Chromium: descarga de todos os eventos nas páginas Eventos, Calendário e no portal, formato e nome dos ficheiros, rótulos dos botões e datas semânticas.
- Área de transferência permitida e bloqueada: link correcto, foco, selecção do endereço, nome da janela e fecho com Escape.
- Falha ao carregar o módulo do calendário: mensagem de erro, sem indicar sucesso.
- 65 páginas em 320, 768, 1024 e 1440 px, sem erros de JavaScript ou transbordamento horizontal.
- Build, verificação de ligações/metadados e calendário nos dois projectos; saída estática equivalente; sete testes do cliente da API aprovados.

Referência de formato: [RFC 5545, secção 3.1](https://www.rfc-editor.org/rfc/rfc5545#section-3.1). Não foi testada a importação em aplicações externas de calendário. Nenhum evento foi publicado como actividade oficial ou enviado a um serviço externo.
