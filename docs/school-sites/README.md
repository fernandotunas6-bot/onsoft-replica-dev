# Websites escolares — documentação de execução

| Documento | Finalidade | Estado |
| --- | --- | --- |
| [Contrato mestre do Website Studio](WEBSITE_STUDIO_MASTER.md) | Prompt, layout dedicado, páginas, dispositivos, inspector, segurança, fases e critérios de aceitação | Primeiro incremento Puck implementado; validado localmente, sem produção |
| [Reconciliação da PR #200](RECONCILIATION_200.md) | Compatibilidade com o motor actual, correcções da PR #275, evidências e roteiro real | Correcções no ramo; integração e ensaio real pendentes |
| [Arquitectura editorial](../architecture/SCHOOL_WEBSITE_CONTENT.md) | Contrato actual de conteúdo, publicação, blog e hospedagem | Referência do motor existente |
| [API institucional](../architecture/SCHOOL_WEBSITE_API.md) | Contratos das APIs públicas escolares | Referência técnica existente |

O motor canónico é `src/features/school-website`. A proposta antiga `school-site`
da PR #200 não deve ser integrada sem reconciliação de contratos.

O novo visual é para a área de edição. O template público, os dados oficiais,
autenticação, isolamento da escola e publicação controlada devem ser preservados.


[Execução do estúdio com Puck, capturas e desempenho](../qa/website-studio-2026-10-24/README.md).
[Licença MIT do Puck](PUCK_LICENSE.txt); a distribuição inclui também `public/licenses/puck.txt`.
