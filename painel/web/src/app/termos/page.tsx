import { LegalPage, LegalSection } from "@/components/legal/legal-page"

const SUPPORT_EMAIL = String(import.meta.env["VITE_SUPPORT_EMAIL"] ?? "").trim()
const CONTACT_LINE = SUPPORT_EMAIL
  ? `por e-mail em ${SUPPORT_EMAIL}`
  : "pelos canais de contacto indicados no site"

export default function TermsPage() {
  return (
    <LegalPage
      title="Termos de Serviço"
      description="Condições de utilização do SIGA Plus."
      eyebrow="Legal"
      lastUpdated="Setembro de 2026"
      draftNotice="Este é um rascunho inicial, escrito para dar às escolas uma base honesta sobre como o serviço funciona. Antes de ser considerado definitivo, precisa de revisão por um advogado e da inclusão dos dados de registo formais da empresa (razão social, NIF e morada)."
    >
      <LegalSection title="1. Âmbito destes Termos">
        <p>
          Estes Termos de Serviço regulam a utilização da plataforma SIGA Plus (&ldquo;a
          Plataforma&rdquo;, &ldquo;o Serviço&rdquo;) pelas instituições de ensino
          (&ldquo;a Escola&rdquo;, &ldquo;o Cliente&rdquo;) e pelos seus utilizadores autorizados
          (administradores, secretaria, professores, encarregados de educação e alunos).
        </p>
        <p>
          Ao criar uma escola na Plataforma, ao aceder ao período experimental ou ao subscrever
          um plano pago, a pessoa que regista a escola declara ter poderes para o fazer em nome
          da instituição e aceita estes Termos em nome dela.
        </p>
      </LegalSection>

      <LegalSection title="2. O que é o SIGA Plus">
        <p>
          O SIGA Plus é um sistema de gestão escolar para instituições de ensino em Angola:
          matrículas, pautas e avaliações, tesouraria, documentos oficiais, comunicações,
          acessos e outras funcionalidades descritas na Plataforma. As funcionalidades
          disponíveis variam consoante o plano subscrito.
        </p>
      </LegalSection>

      <LegalSection title="3. Conta e responsabilidades da Escola">
        <p>
          A Escola é responsável por manter os dados de registo correctos e actualizados, por
          proteger as credenciais de acesso dos seus utilizadores (incluindo a senha do
          administrador definida no registo) e por qualquer actividade realizada através das
          contas dos seus utilizadores.
        </p>
        <p>
          A Escola é responsável por garantir que tem uma base legal para introduzir na
          Plataforma dados pessoais de alunos, encarregados de educação e funcionários, incluindo
          o consentimento ou outro fundamento legal exigido pela legislação aplicável.
        </p>
      </LegalSection>

      <LegalSection title="4. Período experimental">
        <p>
          Uma escola nova regista-se com um período experimental gratuito de 14 dias, com acesso
          às funcionalidades do plano escolhido. Findo esse período, o acesso a funcionalidades
          pagas fica dependente da confirmação do pagamento, conforme a secção seguinte.
        </p>
      </LegalSection>

      <LegalSection title="5. Planos, pagamento e facturação">
        <p>
          Os planos e preços em vigor são os apresentados na página de preços da Plataforma. O
          pagamento da subscrição é actualmente feito por transferência bancária (IBAN),
          confirmado manualmente pela equipa do SIGA Plus após o envio do comprovativo pelos
          canais indicados no fim do registo.
        </p>
        <p>
          Enquanto o pagamento não for confirmado, a subscrição paga não fica activa. O SIGA
          Plus reserva-se o direito de rever esta forma de pagamento e de introduzir outros
          meios de cobrança, informando as escolas com antecedência razoável.
        </p>
      </LegalSection>

      <LegalSection title="6. Dados da Escola">
        <p>
          Os dados introduzidos pela Escola na Plataforma (alunos, pautas, documentos, registos
          financeiros, entre outros) pertencem à Escola. O SIGA Plus trata esses dados como
          responsável pelo processamento em nome da Escola, nos termos da nossa{" "}
          <a href="/privacidade" className="text-primary underline underline-offset-4">
            Política de Privacidade
          </a>
          , e mantém-nos isolados de outras instituições clientes.
        </p>
      </LegalSection>

      <LegalSection title="7. Utilização aceitável">
        <p>
          Não é permitido usar a Plataforma para fins ilegais, para introduzir dados de que não
          se tenha o direito de tratar, para tentar aceder a contas ou dados de outras escolas,
          ou para sobrecarregar deliberadamente a infra-estrutura do serviço.
        </p>
      </LegalSection>

      <LegalSection title="8. Disponibilidade do serviço">
        <p>
          O SIGA Plus envida esforços razoáveis para manter o serviço disponível, mas não
          garante disponibilidade ininterrupta. Poderão ocorrer interrupções para manutenção,
          actualizações ou por motivos fora do nosso controlo.
        </p>
      </LegalSection>

      <LegalSection title="9. Suspensão e cancelamento">
        <p>
          A Escola pode deixar de utilizar a Plataforma a qualquer momento. O SIGA Plus pode
          suspender ou encerrar o acesso de uma escola em caso de incumprimento destes Termos,
          de falta de pagamento após aviso prévio, ou de utilização que ponha em risco a
          segurança de outras escolas na Plataforma.
        </p>
      </LegalSection>

      <LegalSection title="10. Propriedade intelectual">
        <p>
          O SIGA Plus, a sua marca, interface e código mantêm-se propriedade da equipa que os
          desenvolve. Nada nestes Termos transfere para a Escola direitos sobre a Plataforma em
          si, para além do direito de a utilizar nos termos aqui descritos.
        </p>
      </LegalSection>

      <LegalSection title="11. Limitação de responsabilidade">
        <p>
          Na medida permitida por lei, o SIGA Plus não se responsabiliza por danos indirectos
          decorrentes da utilização ou impossibilidade de utilização da Plataforma. Nada nestes
          Termos exclui responsabilidade que não possa ser legalmente excluída.
        </p>
      </LegalSection>

      <LegalSection title="12. Alterações a estes Termos">
        <p>
          Podemos actualizar estes Termos para reflectir alterações ao serviço ou à lei
          aplicável. Alterações relevantes serão comunicadas às escolas com uma antecedência
          razoável antes de entrarem em vigor.
        </p>
      </LegalSection>

      <LegalSection title="13. Lei aplicável">
        <p>Estes Termos regem-se pela lei angolana.</p>
      </LegalSection>

      <LegalSection title="14. Contacto">
        <p>Dúvidas sobre estes Termos podem ser esclarecidas {CONTACT_LINE}.</p>
      </LegalSection>
    </LegalPage>
  )
}
