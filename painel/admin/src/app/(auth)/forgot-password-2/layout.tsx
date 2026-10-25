import { AliveBridgeGate } from "@/components/alive-bridge-gate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AliveBridgeGate path="/forgot-password-2">{children}</AliveBridgeGate>;
}
