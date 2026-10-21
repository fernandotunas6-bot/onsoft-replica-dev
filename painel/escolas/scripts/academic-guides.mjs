import {preparationItems} from '../src/admissions.mjs';
export function writeAcademicGuides({write,crumb,head,link,notice,noticeFor,cta,esc,headline,pagina}) {
const cards=items=>`<div class="info-grid">${items.map((x,i)=>`<article class="info-card"><span class="big-number">0${i+1}</span><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p>${x.link?link(esc(x.link.url),esc(x.link.label),'text-link'):''}</article>`).join('')}</div>`;
const inlineCta=block=>`<div class="inline-cta"><p>${esc(block.text)}</p>${link(esc(block.action.url),esc(block.action.label))}</div>`;

const preparar=pagina('preparar-candidatura');
// O total vem da lista real de tarefas: o conteúdo diz a frase, não o número.
const total=preparationItems.length;
write('/preparar-candidatura/',preparar.title,`${crumb(preparar.crumb)}${head('/preparar-candidatura/')}<section class="wrap section">${notice(noticeFor('preparar-candidatura'))}<div class="preparation-summary"><div><h2>${esc(preparar.summary.title)}</h2><p id="preparation-count" role="status" aria-live="polite">${esc(preparar.summary.count).replace('{{TOTAL}}',String(total))}</p></div><div class="preparation-actions"><button class="outline-button" id="preparation-download" type="button">${esc(preparar.summary.download)} ↓</button><button class="text-button" id="preparation-reset" type="button">${esc(preparar.summary.reset)}</button></div></div><progress id="preparation-progress" value="0" max="${total}" aria-label="${esc(preparar.summary.progressLabel)}"></progress><div class="info-grid preparation-grid">${preparationItems.map((item,i)=>`<article class="info-card"><span class="big-number">0${i+1}</span><label class="preparation-check"><input type="checkbox" data-preparation="${item.id}"><strong>${item.title}</strong></label><p>${item.text}</p>${link(item.url,item.label,'text-link')}</article>`).join('')}</div>${inlineCta(preparar.inlineCta)}</section>${cta()}`);

const percursos=pagina('percursos-de-ingresso');
write('/percursos-de-ingresso/',percursos.title,`${crumb(percursos.crumb)}${head('/percursos-de-ingresso/')}<section class="wrap section">${notice(noticeFor('percursos-de-ingresso'))}<div class="section-title"><h2>${headline(percursos.questions.headline)}</h2></div>${cards(percursos.questions.items)}<div class="section-title guide-section-title"><h2>${headline(percursos.faq.headline)}</h2></div><div class="faq-list">${percursos.faq.items.map(x=>`<details><summary>${esc(x.question)}<span>+</span></summary><p>${esc(x.answer)}</p></details>`).join('')}</div>${inlineCta(percursos.inlineCta)}</section>${cta()}`);

const novos=pagina('novos-estudantes');
write('/novos-estudantes/',novos.title,`${crumb(novos.crumb)}${head('/novos-estudantes/')}<section class="wrap section">${notice(noticeFor('novos-estudantes'))}<div class="section-title"><h2>${headline(novos.first.headline)}</h2></div>${cards(novos.first.items)}</section><section class="soft-bg section"><div class="wrap"><div class="section-title"><h2>${headline(novos.second.headline)}</h2></div>${cards(novos.second.items)}${inlineCta(novos.inlineCta)}</div></section>${cta()}`);
}
