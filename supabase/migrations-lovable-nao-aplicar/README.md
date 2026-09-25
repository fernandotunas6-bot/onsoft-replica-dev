# Migrações Lovable — não aplicar

Estes 27 ficheiros descrevem o **modelo de dados antigo**, gerado para o projecto Lovable e
substituído pelo esquema oficial do SGA (memberships/roles/programs/campuses/...). Aplicá-los
a `xodgfmxiaunpamctfeea` criaria um modelo paralelo vazio ao lado do que está em uso.

O aviso já existia, em `supabase/DO_NOT_APPLY_TO_SGA.txt`. **Estavam na mesma pasta que as
migrações boas.**

## Porque foram movidos

`supabase db push` aplica tudo o que está em `supabase/migrations/` e não consta de
`supabase_migrations.schema_migrations`. Na auditoria da área 10 verificou-se que:

- o registo na base tem **110** versões;
- a pasta tinha **145** ficheiros;
- **126** desses ficheiros não constavam do registo — e **os 27 de Agosto estavam entre
  eles, todos**.

Ou seja: um único `supabase db push` — comando corrente, que qualquer pessoa ou agente pode
correr de boa-fé — aplicaria os 27. O que o impedia era um ficheiro `.txt` que nenhuma
ferramenta lê.

Mover é a diferença entre um aviso e uma garantia. Não toca em dados e é reversível: se um
dia forem precisos, estão aqui e com o historial de `git mv` intacto.

## O que isto **não** resolve

Os outros **99** ficheiros por registar continuam em `supabase/migrations/`. São trabalho
recente, aplicado à mão por `supabase db query`, e por isso ausente do registo. `db push`
tentaria reaplicá-los; a maioria é idempotente (`IF NOT EXISTS`), mas não toda.

Fechar isso exige uma decisão que não é técnica: **registar como aplicadas as que já o
estão**, reescrevendo o historial do registo para corresponder à realidade. Fica para o
dono do projecto — ver `docs/auditoria/10-auditoria.md`, verificação 10.4.
