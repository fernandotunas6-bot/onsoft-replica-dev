import { test } from "vitest";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

test.skipIf(!process.env.SUPABASE_SECRET_KEY)("debug constraint", async () => {
  const db = await loadSgaAdminClient();
  const { data, error } = await db.from("schools").select("*").limit(1);
  console.log("School sample:", data);
});
