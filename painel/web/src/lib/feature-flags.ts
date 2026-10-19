/**
 * Personalizador de tema do template (botão flutuante). Desligado no site público;
 * ligar com VITE_THEME_CUSTOMIZER=true para explorar cores em desenvolvimento.
 */
export const SHOW_THEME_CUSTOMIZER = import.meta.env.VITE_THEME_CUSTOMIZER === "true"

export const SHOW_UPGRADE_BUTTON = false

/**
 * Rotas demo do kit (mail, chat, dashboards, auth variants…).
 * Desligadas por defeito — o portal comercial só expõe landing/pricing/start/FAQ.
 * Religar com VITE_SHOW_TEMPLATE_SURFACES=true.
 */
export const SHOW_TEMPLATE_SURFACES =
  import.meta.env.VITE_SHOW_TEMPLATE_SURFACES === "true"
