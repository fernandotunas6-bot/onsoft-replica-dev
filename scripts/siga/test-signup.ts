import "dotenv/config";
import { runPublicSchoolSignup } from "../../src/features/saas/public-signup";

async function run() {
  try {
    const res = await runPublicSchoolSignup(
      {
        name: "Test Bug " + Date.now(),
        contact_name: "Valentino",
        contact_email: "valentino.bug@example.com",
        plan_code: "start",
        slug: "bug-test-" + Date.now(),
        admin_email: "valentino.bug@example.com",
        admin_name: "Valentino C",
      },
      "127.0.0.1"
    );
    console.log("Success:", res);
  } catch (err: any) {
    console.error("Error signing up:", err.message);
  }
}

run();
