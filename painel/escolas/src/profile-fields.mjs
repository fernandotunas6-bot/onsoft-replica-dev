export const applicationProfileFields = ['phone', 'education'];
export const educationOptions = ['A concluir o ensino secundário', 'Ensino secundário concluído', 'Ensino superior em curso', 'Ensino superior concluído'];

export function applicationPhoneError(value) {
  const text = String(value || '').trim(); if (!text) return '';
  if (!/^[+\d\s()-]+$/.test(text) || !/^(?:244)?[29]\d{8}$/.test(text.replace(/\D/g, '')))
    return 'Indique 9 algarismos de Angola, com +244 se desejar, ou deixe o campo vazio.';
  return '';
}

export function setupApplicationProfile(form) {
  if (!form || form.elements.phone) return;
  const doc = form.ownerDocument, before = form.elements.motivation?.closest('label');
  if (!before) return;
  const row = doc.createElement('div'); row.className = 'form-row application-profile-fields';
  const phoneLabel = doc.createElement('label'); phoneLabel.textContent = 'Telefone de exemplo (opcional)';
  const phone = doc.createElement('input'); phone.type = 'tel'; phone.name = 'phone'; phone.id = 'application-phone'; phone.maxLength = 24; phone.autocomplete = 'off'; phone.inputMode = 'tel'; phone.placeholder = '+244 9xx xxx xxx';
  const hint = doc.createElement('small'); hint.id = 'application-phone-hint'; hint.className = 'academic-field-hint'; hint.textContent = 'Use dados fictícios. Este campo não envia SMS ou WhatsApp.'; phone.setAttribute('aria-describedby', hint.id);
  phoneLabel.append(phone, hint);
  const educationLabel = doc.createElement('label'); educationLabel.textContent = 'Formação actual (opcional)';
  const education = doc.createElement('select'); education.name = 'education'; education.id = 'application-education';
  const empty = doc.createElement('option'); empty.value = ''; empty.textContent = 'Prefiro indicar depois'; education.append(empty);
  for (const value of educationOptions) {const option = doc.createElement('option'); option.value = value; option.textContent = value; education.append(option);}
  educationLabel.append(education); row.append(phoneLabel, educationLabel); before.before(row);
}

function fieldMessage(input) {
  if (input.name === 'phone') return applicationPhoneError(input.value);
  if (input.required && !input.value.trim()) return 'Preencha este campo.';
  if (input.validity.typeMismatch && input.type === 'email') return 'Indique um e-mail válido, por exemplo nome@exemplo.com.';
  if (input.validity.tooShort) return `Use pelo menos ${input.minLength} caracteres.`;
  if (!input.validity.valid) return input.validationMessage;
  return '';
}

export function refreshApplicationHints(form, clearErrors = false) {
  for (const input of form?.querySelectorAll('input,select,textarea') || []) {
    if (clearErrors) {input.setCustomValidity?.(''); input.removeAttribute('aria-invalid'); const feedback = form.ownerDocument.getElementById(input.id + '-feedback'); if (feedback) {feedback.textContent = ''; feedback.hidden = true;}}
    const counter = form.querySelector(`[data-counter-for="${input.id}"]`);
    if (counter) counter.textContent = `${input.value.length} / ${input.maxLength} caracteres`;
  }
}

export function setupFieldFeedback(form) {
  if (!form || form.dataset.fieldFeedback) return;
  form.dataset.fieldFeedback = 'true';
  for (const input of form.querySelectorAll('input:not([type=checkbox]):not([type=hidden]),select,textarea')) {
    if (!input.name) continue;
    input.id ||= `${form.id}-${input.name}`;
    const feedback = form.ownerDocument.createElement('small'); feedback.id = input.id + '-feedback'; feedback.className = 'academic-field-feedback'; feedback.hidden = true; feedback.setAttribute('role', 'status');
    const description = input.getAttribute('aria-describedby'); input.setAttribute('aria-describedby', [description, feedback.id].filter(Boolean).join(' ')); input.after(feedback);
    let touched = false;
    const update = () => {const message = fieldMessage(input); feedback.textContent = message; feedback.hidden = !message; if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');};
    input.addEventListener('blur', () => {touched = true; if (input.name === 'phone') input.setCustomValidity(applicationPhoneError(input.value)); update();});
    input.addEventListener('input', () => {input.setCustomValidity(''); if (touched) update(); refreshApplicationHints(form);});
    input.addEventListener('change', () => {input.setCustomValidity(''); if (touched) update();});
    input.addEventListener('invalid', () => {touched = true; update();});
    if (input.tagName === 'TEXTAREA' && input.maxLength > 0) {
      const counter = form.ownerDocument.createElement('small'); counter.className = 'academic-field-counter'; counter.dataset.counterFor = input.id; counter.setAttribute('aria-hidden', 'true'); feedback.after(counter);
    }
  }
  refreshApplicationHints(form);
}
