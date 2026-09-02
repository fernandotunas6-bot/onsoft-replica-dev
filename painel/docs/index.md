---
layout: home
hero:
  name: "SIGA Plus"
  tagline: "Plataforma Integrada de Gestão Académica e Administrativa. Documentação oficial do ecossistema SIGA Plus."
  image:
    src: /hero.png
    alt: Pré-visualização do SIGA Plus
    width: 800px
    height: auto
  actions:
    - theme: brand
      text: Começar
      link: /guide/
    - theme: alt
      text: Navegação SIGA
      link: /siga/navegacao
    - theme: alt
      text: Arquitetura
      link: /arquitetura/
    - theme: alt
      text: Criar escola (WEB)
      link: /web/criar-escola
    - theme: alt
      text: Control Center
      link: /admin/control-center
    - theme: alt
      text: Entrar no SIGA
      link: https://portal-siga.com
      target: _blank

features:
  - icon:
      src: /icons/dashboard.svg
      alt: SIGA escolar
    title: SIGA — operação escolar
    details: Alunos, pedagógica, tesouraria, documentos, arquivos, catracas e portais por papel
  - icon:
      src: /icons/globe.svg
      alt: WEB comercial
    title: WEB — vende
    details: Landing, planos e wizard /start para provisionar escolas via API SaaS
  - icon:
      src: /icons/zap.svg
      alt: ADMIN SaaS
    title: ADMIN — controla
    details: Tenants, subscrições, domínios, operadores platform_admins e auditoria
  - icon:
      src: /icons/rocket.svg
      alt: DOC
    title: DOC — explica
    details: Manuais de navegação, integrações Multicaixa/Unitel, arquitectura e onboarding
  - icon:
      src: /icons/smartphone.svg
      alt: RBAC
    title: Permissões por papel e plano
    details: Sidebar e launcher filtrados por cargo, grants e features do plano SaaS
  - icon:
      src: /icons/palette.svg
      alt: Angola
    title: Identidade Angola
    details: BI/NIF, IBAN AO, telemóvel +244, Multicaixa Express e Unitel Money
---

## Módulos do Sistema SIGA Plus

<div class="demo-links">
  <div class="demo-card">
    <div class="demo-icon"><img src="/icons/dashboard.svg" alt="Painel Principal" width="48" height="48" style="margin: 0 auto;" /></div>
    <h3>Painel Administrativo SIGA Plus</h3>
    <p>Portal administrativo completo com gestão escolar, acadêmica, financeira, pautas, controle de acessos e configurações</p>
    <a href="/guide/" class="demo-button">Explorar Guias do Painel</a>
  </div>
  
  <div class="demo-card">
    <div class="demo-icon"><img src="/icons/globe.svg" alt="Portal WEB" width="48" height="48" style="margin: 0 auto;" /></div>
    <h3>Portal WEB (Comercial)</h3>
    <p>Marketing, planos SaaS e wizard de criação de escola</p>
    <a href="https://siga-web.pages.dev/start" class="demo-button" target="_blank" rel="noreferrer">Abrir wizard /start</a>
    <a href="/web/criar-escola" class="demo-button" style="margin-top: 0.5rem; display: inline-block;">Manual do wizard</a>
  </div>

  <div class="demo-card">
    <div class="demo-icon"><img src="/icons/dashboard.svg" alt="SaaS Admin" width="48" height="48" style="margin: 0 auto;" /></div>
    <h3>ADMIN — SaaS Control Center</h3>
    <p>Tenants, métricas e gestão de assinaturas da plataforma</p>
    <a href="https://siga-admin.pages.dev/tenants" class="demo-button" target="_blank" rel="noreferrer">Abrir ADMIN</a>
    <a href="/admin/control-center" class="demo-button" style="margin-top: 0.5rem; display: inline-block;">Manual do Control Center</a>
  </div>

  <div class="demo-card">
    <div class="demo-icon"><img src="/icons/rocket.svg" alt="SIGA Plus" width="48" height="48" style="margin: 0 auto;" /></div>
    <h3>SIGA Plus (Operação escolar)</h3>
    <p>Alunos, pautas, finanças e catracas</p>
    <a href="https://portal-siga.com" class="demo-button" target="_blank" rel="noreferrer">Abrir SIGA</a>
    <a href="/siga/navegacao" class="demo-button" style="margin-top: 0.5rem; display: inline-block;">Mapa de navegação</a>
  </div>
  
  <div class="demo-card">
    <div class="demo-icon"><img src="/icons/globe.svg" alt="Componentes" width="48" height="48" style="margin: 0 auto;" /></div>
    <h3>Biblioteca de Componentes</h3>
    <p>Componentes reutilizáveis, tabelas de dados de alta densidade, gráficos analíticos e integrações de UI</p>
    <a href="/components/" class="demo-button">Ver Componentes</a>
  </div>

  <div class="demo-card">
    <div class="demo-icon"><img src="/icons/palette.svg" alt="Customizador de Tema" width="48" height="48" style="margin: 0 auto;" /></div>
    <h3>Customizador de Tema</h3>
    <p>Configuração de cores, temas institucionais, raio, sidebar e importação de paletas em tempo real</p>
    <a href="/theme-customizer/" class="demo-button">Abrir guia de cores</a>
  </div>
</div>

<style>
.demo-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin: 2rem 0 3rem 0;
}

.demo-card {
  padding: 2rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  text-align: center;
}

.demo-icon {
  margin-bottom: 1rem;
  display: flex;
  justify-content: center;
}

.demo-card h3 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.demo-card p {
  margin: 0 0 1.5rem 0;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}

.demo-button {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  background: var(--vp-c-brand-1);
  color: white !important;
  text-decoration: none !important;
  border-radius: 6px;
  font-weight: 500;
}

/* Features customization for better icon-title alignment */
.VPFeature .icon {
  margin-bottom: 1rem;
}

.VPFeatures .VPFeature h2 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
}
</style>
