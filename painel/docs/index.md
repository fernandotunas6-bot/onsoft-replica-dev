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
      text: Ensino público (PDF/Word)
      link: /institucional/ensino-publico
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
      text: PayFlow
      link: /financeiro/payflow
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
      src: /icons/smartphone.svg
      alt: PayFlow
    title: PAYFLOW — cobra
    details: Pagamentos, recibos e conciliação escolar, com marca própria
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

<script setup>
import { ECOSYSTEM } from './.vitepress/ecosystem'
</script>

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
    <p>Apresentação, planos e assistente de criação da escola</p>
    <a :href="`${ECOSYSTEM.web}/start`" class="demo-button" target="_blank" rel="noreferrer">Criar a escola</a>
    <a href="/web/criar-escola" class="demo-button" style="margin-top: 0.5rem; display: inline-block;">Manual da criação</a>
  </div>

  <div class="demo-card">
    <div class="demo-icon"><img src="/icons/dashboard.svg" alt="SaaS Admin" width="48" height="48" style="margin: 0 auto;" /></div>
    <h3>ADMIN — SaaS Control Center</h3>
    <p>Tenants, métricas e gestão de assinaturas da plataforma</p>
    <a :href="`${ECOSYSTEM.admin}/tenants`" class="demo-button" target="_blank" rel="noreferrer">Abrir ADMIN</a>
    <a href="/admin/control-center" class="demo-button" style="margin-top: 0.5rem; display: inline-block;">Manual do Control Center</a>
  </div>

  <div class="demo-card">
    <div class="demo-icon"><img src="/icons/rocket.svg" alt="SIGA Plus" width="48" height="48" style="margin: 0 auto;" /></div>
    <h3>SIGA Plus (Operação escolar)</h3>
    <p>Alunos, pautas, finanças e catracas</p>
    <a :href="ECOSYSTEM.siga" class="demo-button" target="_blank" rel="noreferrer">Abrir SIGA</a>
    <a href="/siga/navegacao" class="demo-button" style="margin-top: 0.5rem; display: inline-block;">Mapa de navegação</a>
  </div>

  <div class="demo-card">
    <div class="demo-icon"><img src="/icons/smartphone.svg" alt="PayFlow" width="48" height="48" style="margin: 0 auto;" /></div>
    <h3>PayFlow (Cobrança)</h3>
    <p>Pagamentos, recibos e conciliação — app própria, integrada ao SIGA</p>
    <a href="/financeiro/payflow" class="demo-button">Manual PayFlow</a>
  </div>
  
  <div class="demo-card">
    <div class="demo-icon"><img src="/icons/palette.svg" alt="" width="48" height="48" style="margin: 0 auto;" /></div>
    <h3>Aparência e marca</h3>
    <p>Tema claro ou escuro, densidade, cor de destaque e as cores e o logótipo da escola</p>
    <a href="/guide/theme-system" class="demo-button">Ver o guia</a>
  </div>

  <div class="demo-card">
    <div class="demo-icon"><img src="/icons/globe.svg" alt="" width="48" height="48" style="margin: 0 auto;" /></div>
    <h3>Suporte</h3>
    <p>Contacto da equipa SIGA Plus, manuais por área e como pedir ajuda com rapidez</p>
    <a href="/guide/support" class="demo-button">Pedir ajuda</a>
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
