// Decorative additions deliberately leave the CMS text/image binding IDs intact.
export function admissionFeeLabel(amount) {
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 100_000_000
    ? new Intl.NumberFormat('pt-AO', {maximumFractionDigits: 0}).format(amount) + ' Kz'
    : 'A confirmar pela escola';
}

export function admissionSummaryHTML(config, {completed = false} = {}) {
  const fee = admissionFeeLabel(config?.admissionFeeAmount);
  return `<section class="admission-summary" aria-label="Taxa e próximos passos">
    <div class="admission-summary-heading"><span>Taxa de candidatura</span><strong>${fee}</strong></div>
    <p>Valor da candidatura. As propinas e outras taxas são confirmadas separadamente pela instituição.</p>
    <ol class="admission-journey">
      <li class="${completed ? 'is-complete' : 'is-current'}"><span>01</span><div><strong>${completed ? 'Resumo guardado' : 'Rever os dados'}</strong><small>${completed ? 'Disponível apenas neste navegador.' : 'Confirme o curso e os seus dados antes de concluir.'}</small></div></li>
      <li><span>02</span><div><strong>Confirmação da escola</strong><small>Na candidatura oficial, guarde o número de processo e acompanhe as orientações da secretaria.</small></div></li>
      <li><span>03</span><div><strong>Pagamento</strong><small>O pagamento online ainda não está disponível. Aguarde a orientação da escola.</small></div></li>
    </ol>
    <p class="admission-status">${completed ? 'Demonstração: nenhum e-mail ou SMS foi enviado e nenhum pagamento foi efectuado.' : 'Nesta demonstração não há envio de notificações nem cobrança.'}</p>
  </section>`;
}

export function setupSchoolPresentation(config) {
  const root = document.documentElement;
  root.dataset.bannerStyle = config?.bannerStyle === 'prism' ? 'prism' : 'classic';
  for (const host of document.querySelectorAll('.hero-visual,.blue-band,.login-story')) {
    if (host.querySelector('.school-monogram')) continue;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('school-monogram');
    svg.setAttribute('viewBox', '0 0 600 200');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const text = document.createElementNS(svg.namespaceURI, 'text');
    text.setAttribute('x', '300'); text.setAttribute('y', '150');
    text.setAttribute('text-anchor', 'middle'); text.setAttribute('textLength', '550');
    text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    text.textContent = String(config?.schoolName || 'ISPAB').slice(0, 30);
    svg.append(text); host.prepend(svg);
  }
  const loginStatus = document.querySelector('[data-siga-status]');
  if (loginStatus && config?.portalUrl) loginStatus.textContent = 'Entre com a mesma conta do SIGA Plus. No sistema, utilize e-mail ou Google, quando disponível. A verificação de segurança mantém-se no seu login habitual.';
  const aside = document.querySelector('.application-aside');
  if (aside && !aside.querySelector('.admission-summary')) aside.insertAdjacentHTML('beforeend', admissionSummaryHTML(config));
}
