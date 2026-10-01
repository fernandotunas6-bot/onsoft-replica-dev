const portal = "https://portal-siga.com";
const button = document.getElementById("connect");
const status = document.getElementById("status");
button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "A verificar a ligação ao portal…";
  try {
    // O pedido opaco confirma apenas transporte, não o estado HTTP nem a sessão.
    await fetch(portal, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(8000) });
    status.textContent = "A abrir o portal SIGA…";
    window.location.assign(portal);
  } catch {
    status.textContent =
      "Não foi possível ligar ao portal. Verifique a Internet e tente novamente.";
    button.disabled = false;
    button.textContent = "Tentar novamente";
  }
});
