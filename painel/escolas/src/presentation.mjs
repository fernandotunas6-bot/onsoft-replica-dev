// Presentation additions deliberately preserve the approved image composition and CMS bindings.
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
  const loginStatus = document.querySelector('[data-siga-status]');
  if (loginStatus && config?.portalUrl) loginStatus.textContent = 'Entre com a mesma conta do SIGA Plus. No sistema, utilize e-mail ou Google, quando disponível. A verificação de segurança mantém-se no seu login habitual.';
  const aside = document.querySelector('.application-aside');
  if (aside && !aside.querySelector('.admission-summary')) aside.insertAdjacentHTML('beforeend', admissionSummaryHTML(config));
}
