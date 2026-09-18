import { test } from "vitest";
import { provisionTenantCore } from "@/features/saas/provisioning-core";

test.skipIf(!process.env.SUPABASE_SECRET_KEY)("debug full signup final", async () => {
  const result = await provisionTenantCore(
    {
      name: "Bug Fix Final " + Date.now(),
      contact_name: "Valentino Final",
      contact_email: "valentino.final+" + Date.now() + "@gmail.com",
      plan_code: "start",
      slug: "bug-fix-final-" + Date.now(),
      admin_email: "valentino.final+" + Date.now() + "@gmail.com",
      admin_name: "Valentino C",
      trial_days: 14,
    },
    { auditUserId: null, source: "public_signup" },
  );
  console.log("PROVISION RESULT:", result);
});
