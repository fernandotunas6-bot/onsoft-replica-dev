import { CheckoutExperience } from "./checkout-experience";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CheckoutExperience token={token} />;
}
