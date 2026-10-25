import { AliveBridgeGate } from "@/components/alive-bridge-gate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AliveBridgeGate path="/sign-in-2">{children}</AliveBridgeGate>;
}
