/**
 * settings-panels.tsx
 *
 * Hub de re-exports dos painéis de definições do SIGA (Ciclo 49).
 * Cada painel vive no seu módulo dedicado em `src/features/school/`.
 */

export { SchoolSettingsPanel } from "./settings-school-panel";
export {
  BillingParametersSummary,
  BillingSettingsForm,
  FeePlanSettingsForm,
} from "./settings-billing-panel";
export { FinancePanel } from "./settings-finance-panel";
export {
  PedagogicalSettingsPanel,
  ModuleShortcutsRow,
} from "./settings-pedagogical-panel";
export { IntegrationsPanel } from "./settings-integrations-panel";
export { SecurityPanel } from "./settings-security-panel";
export { DigitalIdentityPanel } from "./settings-identity-panel";
