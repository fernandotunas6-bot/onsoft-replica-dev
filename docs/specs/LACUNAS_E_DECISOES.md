# Lacunas e decisões pendentes

08/10/2026. **Biblioteca de empréstimos e capelania:** nenhum domínio funcional autónomo foi identificado no inventário actual de `src/features`, rotas e catálogo de módulos. “Biblioteca” de ficheiros/modelos não é empréstimo de livros. Não criar páginas ou regras simuladas para declarar cobertura. Se estes domínios forem desejados, ficam **por decidir**: âmbito, perfis, dados, estados, regras de empréstimo/multa e critérios próprios.

Outras decisões que o agente não pode preencher por suposição:

- Base institucional/legal de escalas, pesos, limiares, recurso, equivalências/créditos e promoção por regime.
- Critérios de encerramento anual para pendências académicas, financeiras e documentais; política de reabertura de ano fechado/arquivado.
- Obrigações financeiras automáticas da matrícula/renovação, bolsas, taxas e excepções de capacidade.
- Destinos e consentimento para comunicação; fornecedor/capacidades de cada integração efectivamente contratados.
- Provider PayFlow e homologação, SSO/liquidação e sandbox; nenhum dinheiro real usado para testar.
- Staging com duas escolas e contas por papel/MFA; backup/restauro e carga autorizados em ambiente isolado.
- Chaves/releases desktop, operações offline suportadas e resolução de conflitos.
- Leaked-password protection, rotação de credenciais e remoção dos restos E2E de produção: trabalhos operacionais separados, sem execução nesta evolução.

Cada decisão deve registar dono, fonte, versão/data, regra, testes e efeito nos módulos dependentes. Enquanto faltar decisão, avançar nas partes independentes e apresentar a limitação exacta; não falsear sucesso nem considerar um módulo concluído.

[Índice](README.md) · [Matriz](matriz-evolucao.csv)
