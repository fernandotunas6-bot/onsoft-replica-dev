import { LegalPage, LegalSection } from "@/components/legal/legal-page"

const SUPPORT_EMAIL = String(import.meta.env["VITE_SUPPORT_EMAIL"] ?? "").trim()
const CONTACT_LINE = SUPPORT_EMAIL
  ? `por e-mail em ${SUPPORT_EMAIL}`
  : "pelos canais de contacto indicados no site"

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Política de Privacidade"
      description="Como o SIGA Plus recolhe, usa e protege os seus dados."
      eyebrow="Legal"
      lastUpdated="Setembro de 2026"
      draftNotice="Este é um rascunho inicial, escrito com base no que a plataforma de facto faz com os dados hoje. Antes de ser considerado definitivo, precisa de revisão por um advogado e da confirmação dos dados de registo formais da empresa (razão social, NIF, morada e encarregado de protecção de dados, se aplicável)."
    >
      <LegalSection title="1. Quem trata os seus dados">
        <p>
          Esta política aplica-se aos dados recolhidos pelo SIGA Plus através do portal
          comercial (WEB), da plataforma de gestão escolar (SIGA) e do painel administrativo
          (ADMIN). Para os dados que a Escola introduz sobre alunos, encarregados de educação e
          funcionários, o SIGA Plus actua como prestador de serviços em nome da Escola — quem
          decide o que é recolhido e para quê é a própria Escola.
        </p>
      </LegalSection>

      <LegalSection title="2. Que dados recolhemos">
        <p>No registo de uma escola, recolhemos:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Dados da instituição: nome, NIF, cidade, endereço, telefone, e-mail.</li>
          <li>Dados do responsável pelo registo: nome, cargo, e-mail, telefone.</li>
          <li>
            Dados da conta do administrador: nome, e-mail e senha de acesso (guardada de forma
            encriptada — nunca em texto simples).
          </li>
        </ul>
        <p>
          Durante o uso normal da Plataforma, a Escola introduz ainda dados de alunos,
          encarregados de educação, professores e funcionários (por exemplo, nome, número de BI,
          data de nascimento, pautas, dados de contacto e de tesouraria) necessários para o
          funcionamento dos módulos que a Escola escolhe usar.
        </p>
      </LegalSection>

      <LegalSection title="3. Para que usamos os dados">
        <ul className="list-disc space-y-1 pl-5">
          <li>Criar e operar a conta da escola e das contas dos seus utilizadores.</li>
          <li>Prestar as funcionalidades da Plataforma (matrículas, pautas, tesouraria, documentos, comunicações).</li>
          <li>Comunicar sobre a conta, o período experimental e a facturação.</li>
          <li>Garantir a segurança da Plataforma e prevenir utilização abusiva.</li>
          <li>Cumprir obrigações legais quando aplicável.</li>
        </ul>
        <p>Não vendemos dados pessoais a terceiros.</p>
      </LegalSection>

      <LegalSection title="4. Com quem partilhamos dados">
        <p>
          Os dados são alojados em infra-estrutura de prestadores de serviços técnicos (por
          exemplo, alojamento de base de dados e envio de e-mail) estritamente para operar a
          Plataforma, sob obrigações de confidencialidade. Cada escola tem os seus dados
          isolados das restantes escolas clientes do SIGA Plus.
        </p>
      </LegalSection>

      <LegalSection id="google" title="5. Início de sessão com Google">
        <p>
          Quem escolhe entrar com a conta Google autoriza o SIGA Plus a receber da Google apenas
          o nome, o endereço de e-mail e a fotografia de perfil. Estes dados servem só para
          identificar a pessoa e iniciar a sessão; o SIGA Plus não pede acesso ao Gmail, ao
          Drive, aos contactos nem a qualquer outro serviço da conta Google.
        </p>
        <p>
          Os dados recebidos da Google não são vendidos, não são usados para publicidade e não
          são partilhados com terceiros, excepto os prestadores técnicos que alojam a
          Plataforma. O uso destes dados cumpre a{" "}
          <a
            className="underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Política de Dados do Utilizador dos Serviços de API da Google
          </a>
          , incluindo os requisitos de Uso Limitado.
        </p>
        <p>
          A autorização pode ser retirada a qualquer momento em{" "}
          <a
            className="underline"
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
          >
            myaccount.google.com/permissions
          </a>
          . Deixa então de ser possível entrar com Google; para eliminar também a conta no SIGA
          Plus, use os contactos indicados no fim desta política.
        </p>
      </LegalSection>

      <LegalSection title="6. Onde e por quanto tempo guardamos os dados">
        <p>
          Os dados são guardados enquanto a conta da escola estiver activa. Após o cancelamento
          de uma escola, os dados são conservados apenas pelo tempo necessário para cumprir
          obrigações legais ou resolver eventuais disputas, sendo depois eliminados ou
          anonimizados.
        </p>
      </LegalSection>

      <LegalSection title="7. Segurança">
        <p>
          Aplicamos medidas técnicas de segurança proporcionais à natureza dos dados, incluindo
          isolamento dos dados entre escolas, autenticação com senha encriptada e, quando
          activada pela escola, autenticação de dois factores para as suas contas.
        </p>
      </LegalSection>

      <LegalSection title="8. Os seus direitos">
        <p>
          Nos termos da legislação angolana de protecção de dados pessoais, o titular dos dados
          tem, entre outros, o direito de aceder, corrigir e solicitar a eliminação dos seus
          dados pessoais. Pedidos relativos a dados de alunos, encarregados de educação ou
          funcionários devem em primeiro lugar ser dirigidos à respectiva escola, responsável
          por essas contas; pedidos relativos aos dados da própria instituição ou do
          administrador podem ser dirigidos directamente ao SIGA Plus.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="9. Cookies">
        <p>
          O site usa apenas cookies essenciais ao funcionamento (por exemplo, manter a sessão
          iniciada) e cookies técnicos de desempenho da infra-estrutura que aloja o site. Não
          usamos cookies de publicidade nem de perfilamento de terceiros.
        </p>
      </LegalSection>

      <LegalSection title="10. Alterações a esta política">
        <p>
          Podemos actualizar esta política para reflectir alterações à Plataforma ou à lei
          aplicável. Alterações relevantes serão comunicadas às escolas com uma antecedência
          razoável antes de entrarem em vigor.
        </p>
      </LegalSection>

      <LegalSection title="11. Contacto">
        <p>Questões sobre esta política podem ser esclarecidas {CONTACT_LINE}.</p>
      </LegalSection>
    </LegalPage>
  )
}
