const portal = "https://portal-siga.com";
const byId = (id) => document.getElementById(id);
const controls = [byId("connect"), byId("diagnose"), byId("browser")];
const version = document.querySelector('meta[name="siga-version"]').content;
const nativeInvoke = window.__TAURI__?.core?.invoke;
let activeOperation = null;
let diagnostics = {
  version,
  platform: nativeInvoke ? "Desktop nativo" : "Pré-visualização web",
  portal: "Por verificar",
  daemon: "Por verificar",
  checked: "Ainda não executada",
};

function setStatus(state, title, message) {
  byId("connection").dataset.state = state;
  byId("connection-title").textContent = title;
  byId("status").textContent = message;
}

function setBusy(busy, cancellable = true) {
  for (const control of controls) control.disabled = busy;
  byId("cancel").hidden = !busy || !cancellable;
  byId("connection").setAttribute("aria-busy", String(busy));
}

function renderDiagnostics() {
  byId("version").textContent = `v${diagnostics.version}`;
  byId("platform").textContent = diagnostics.platform;
  byId("app-detail").textContent = `v${diagnostics.version} · ${diagnostics.platform}`;
  byId("portal-detail").textContent = diagnostics.portal;
  byId("daemon-detail").textContent = diagnostics.daemon;
  byId("checked-detail").textContent = diagnostics.checked;
}

async function checkConnection(openPortal) {
  if (activeOperation) return;
  const operation = { controller: new AbortController() };
  activeOperation = operation;
  setBusy(true);
  setStatus("busy", "A verificar a ligação…", "Pode cancelar esta verificação a qualquer momento.");
  operation.timer = setTimeout(() => operation.controller.abort(), 8000);
  try {
    const [network, device] = await Promise.allSettled([
      // Resposta opaca: prova apenas transporte, não estado HTTP nem autenticação.
      fetch(portal, { mode: "no-cors", cache: "no-store", signal: operation.controller.signal }),
      nativeInvoke ? nativeInvoke("get_desktop_diagnostics") : Promise.resolve(null),
    ]);
    if (activeOperation !== operation || operation.controller.signal.aborted) {
      if (activeOperation === operation) {
        diagnostics.checked = new Date().toLocaleString("pt-PT");
        diagnostics.portal = "Sem resposta (timeout)";
        renderDiagnostics();
        setStatus(
          "error",
          "O portal não respondeu a tempo",
          "Verifique a Internet e tente novamente.",
        );
      }
      return;
    }
    diagnostics.checked = new Date().toLocaleString("pt-PT");
    diagnostics.portal = network.status === "fulfilled" ? "Transporte disponível" : "Sem resposta";
    if (device.status === "fulfilled" && device.value) {
      const info = device.value;
      diagnostics.version = info.version;
      diagnostics.platform = `${info.os_type} · ${info.arch}`;
      diagnostics.daemon = info.daemon_online ? "Daemon SIGA ligado" : info.daemon_message;
    } else {
      diagnostics.daemon = nativeInvoke
        ? "Diagnóstico nativo indisponível"
        : "Disponível apenas no desktop";
    }
    renderDiagnostics();
    if (!openPortal) byId("diagnostics").open = true;
    if (network.status === "fulfilled") {
      setStatus(
        "success",
        openPortal ? "A abrir o SIGA…" : "Ligação disponível",
        "O portal verifica a sua conta e o acesso à escola.",
      );
      byId("connect-label").textContent = "Abrir SIGA";
      if (openPortal) window.location.assign(portal);
    } else {
      byId("connect-label").textContent = "Tentar novamente";
      setStatus(
        "error",
        "Não foi possível ligar ao portal",
        "Verifique a Internet e tente novamente. O diagnóstico local continua disponível.",
      );
    }
  } catch {
    if (activeOperation === operation) {
      setStatus(
        "error",
        "Não foi possível concluir a verificação",
        "Tente novamente ou abra o portal no navegador.",
      );
    }
  } finally {
    clearTimeout(operation.timer);
    if (activeOperation === operation) {
      activeOperation = null;
      setBusy(false);
    }
  }
}

byId("connect").addEventListener("click", () => void checkConnection(true));
byId("diagnose").addEventListener("click", () => void checkConnection(false));
byId("cancel").addEventListener("click", () => {
  if (!activeOperation) return;
  const operation = activeOperation;
  activeOperation = null;
  clearTimeout(operation.timer);
  operation.controller.abort();
  setBusy(false);
  setStatus(
    "idle",
    "Verificação cancelada",
    "Nenhuma operação académica foi executada. Pode tentar novamente.",
  );
});

byId("browser").addEventListener("click", async () => {
  if (activeOperation) return;
  const operation = {};
  activeOperation = operation;
  setBusy(true, false);
  try {
    if (nativeInvoke) {
      await nativeInvoke("open_school_portal");
    } else {
      const opened = window.open(portal, "_blank", "noopener,noreferrer");
      // Com noopener, alguns navegadores devolvem null mesmo quando abriram a aba.
      if (opened) opened.opener = null;
    }
    setStatus(
      "idle",
      "Pedido enviado ao navegador",
      "Continue no portal. Se a janela não aparecer, verifique o bloqueio de pop-ups.",
    );
  } catch {
    setStatus(
      "error",
      "Não foi possível abrir o navegador",
      "Tente abrir o SIGA nesta janela ou contacte o suporte.",
    );
  } finally {
    activeOperation = null;
    setBusy(false);
  }
});

byId("copy").addEventListener("click", async () => {
  const report = [
    "SIGA Desktop — diagnóstico",
    `Versão: ${diagnostics.version}`,
    `Sistema: ${diagnostics.platform}`,
    `Portal: ${portal}`,
    `Ligação: ${diagnostics.portal}`,
    `Hardware: ${diagnostics.daemon}`,
    `Verificação: ${diagnostics.checked}`,
  ].join("\n");
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard indisponível");
    await navigator.clipboard.writeText(report);
    byId("copy-status").textContent =
      "Diagnóstico copiado. Não inclui credenciais nem dados escolares.";
  } catch {
    byId("report").textContent = report;
    byId("report").hidden = false;
    byId("report").focus();
    byId("copy-status").textContent =
      "Seleccione e copie o texto abaixo. A área de transferência não está disponível.";
  }
});

const helpDialog = byId("help-dialog");
byId("help").addEventListener("click", () => {
  if (!helpDialog.open) helpDialog.showModal();
});
for (const id of ["close-help", "done-help"])
  byId(id).addEventListener("click", () => helpDialog.close());

let theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
try {
  const saved = localStorage.getItem("siga-desktop-theme");
  if (["light", "dark"].includes(saved)) theme = saved;
} catch {
  /* O tema continua funcional se o armazenamento não estiver disponível. */
}
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  byId("theme").setAttribute(
    "aria-label",
    theme === "dark" ? "Activar tema claro" : "Activar tema escuro",
  );
}
byId("theme").addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  applyTheme();
  try {
    localStorage.setItem("siga-desktop-theme", theme);
  } catch {
    /* Sem persistência. */
  }
});
applyTheme();
renderDiagnostics();
