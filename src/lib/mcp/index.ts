import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listClassGroupsTool from "./tools/list-class-groups";

// Emissor directo (não o proxy publicado); o ref é inlinado pelo Vite.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "edu-s-code-mirror",
  title: "Edu's Code Mirror",
  version: "0.1.0",
  instructions:
    "Ferramentas do SIGA Plus (gestão escolar). Actuam como o utilizador ligado e respeitam as permissões da sua escola. Use `whoami` para confirmar a conta e `list_class_groups` para ver turmas.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listClassGroupsTool],
});
