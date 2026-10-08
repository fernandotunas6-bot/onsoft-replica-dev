/*
 * Verificação do navegador do SIGA Plus (portal e app SIGA Desktop).
 *
 * O SIGA é compilado para navegadores com o motor do Safari 16.4 ou mais recente
 * (Chrome/Edge 111, Firefox 114). Num motor mais antigo o ecrã aparece, mas o código
 * não arranca: botões, PIN e entrada não respondem. No Mac a app SIGA Desktop usa o
 * motor do Safari instalado no sistema, por isso um Mac com o Safari por actualizar
 * fica assim. Em vez de um ecrã morto, mostra como resolver.
 *
 * Sintaxe antiga de propósito (var, function, sem módulos): tem de correr nos motores
 * antigos que pretende detectar. A cópia em desktop/public/ tem de ser igual (há um teste).
 */
(function () {
  "use strict";

  function supported() {
    try {
      // Lookbehind em expressões regulares: Safari 16.4, Chrome 62, Firefox 78.
      new RegExp("(?<=a)b");
    } catch (e) {
      return false;
    }
    try {
      // color-mix(): Safari 16.2, Chrome 111, Firefox 113 (Tailwind 4 usa-o nas cores).
      if (window.CSS && CSS.supports && !CSS.supports("color", "color-mix(in srgb, red, blue)")) {
        return false;
      }
    } catch (e) {
      return false;
    }
    return true;
  }

  if (supported()) return;

  var ua = navigator.userAgent || "";
  var iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var mac = !iOS && /Macintosh|Mac OS X/.test(ua);
  var desktopApp = Boolean(window.__TAURI_INTERNALS__ || window.isTauri);

  var title;
  var intro;
  var steps;
  var note;
  if (mac) {
    title = "É preciso actualizar o Safari deste Mac";
    intro =
      (desktopApp ? "A app SIGA Desktop usa o motor do Safari do Mac. " : "") +
      "O SIGA Plus precisa do Safari 16.4 ou mais recente e este Mac tem uma versão antiga: " +
      "por isso os botões, o PIN e a entrada não funcionam.";
    steps = [
      "Abra o menu Apple () → Preferências do Sistema → Actualização de Software.",
      "Instale a actualização do Safari (pode estar em «Mais informações…»). No macOS 12 Monterey fica o Safari 17; no macOS 11 Big Sur, o Safari 16.6.",
      "Feche e volte a abrir o SIGA" + (desktopApp ? " Desktop." : "."),
    ];
    note =
      "No macOS 10.15 Catalina ou anterior não há Safari compatível: use o Firefox actualizado " +
      "ou o SIGA Plus noutro computador.";
  } else if (iOS) {
    title = "É preciso actualizar o iOS";
    intro = "O SIGA Plus precisa do iOS/iPadOS 16.4 ou mais recente.";
    steps = [
      "Abra Definições → Geral → Actualização de software.",
      "Instale a actualização e volte a abrir o SIGA Plus.",
    ];
    note = "";
  } else {
    title = "Este navegador é antigo demais para o SIGA Plus";
    intro = "O ecrã aparece, mas os botões e a entrada não funcionam nesta versão.";
    steps = [
      "Actualize o navegador, ou use a versão mais recente do Chrome, Edge ou Firefox.",
      "Volte a abrir o SIGA Plus.",
    ];
    note = "";
  }

  function el(tag, style, text) {
    var node = document.createElement(tag);
    node.setAttribute("style", style);
    if (text) node.appendChild(document.createTextNode(text));
    return node;
  }

  function show() {
    if (document.getElementById("siga-browser-check")) return;
    var overlay = el(
      "div",
      "position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;overflow:auto;" +
        "background:#F8F8FA;color:#0F172A;display:flex;align-items:center;justify-content:center;" +
        "padding:24px;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
    );
    overlay.id = "siga-browser-check";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "siga-browser-check-title");

    var card = el(
      "div",
      "max-width:520px;width:100%;background:#fff;border:1px solid #E2E8F0;border-radius:16px;" +
        "padding:28px;box-shadow:0 10px 30px rgba(15,23,42,.08);",
    );
    var heading = el(
      "h1",
      "margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;",
      title,
    );
    heading.id = "siga-browser-check-title";
    card.appendChild(heading);
    card.appendChild(el("p", "margin:0 0 16px;color:#475569;", intro));

    var list = el("ol", "margin:0 0 16px;padding-left:20px;");
    for (var i = 0; i < steps.length; i++) {
      list.appendChild(el("li", "margin:0 0 8px;", steps[i]));
    }
    card.appendChild(list);
    if (note) card.appendChild(el("p", "margin:0;font-size:13px;color:#64748B;", note));

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  document.documentElement.setAttribute("data-siga-browser", "outdated");
  if (document.body) show();
  else document.addEventListener("DOMContentLoaded", show);
})();
