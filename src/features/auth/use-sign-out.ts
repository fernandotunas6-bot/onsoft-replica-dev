import { clearSigaCaches } from "@/lib/pwa";
import { clearOfflineQueries } from "@/lib/offline/offline-queries";
import { forgetAllTrustedDevices } from "@/features/auth/trusted-device";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function useSignOut() {
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async (scope: "local" | "global" = "local") => {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut({ scope });
      if (error) {
        toast.error("Não foi possível terminar a sessão.");
        setSigningOut(false);
        return false;
      }
      // Quem sai de propósito deixa de confiar neste dispositivo.
      forgetAllTrustedDevices();
      queryClient.clear();
      await clearSigaCaches().catch(() => undefined);
      // A fila de envio sem rede fica: está no cofre do posto e só sai com esta pessoa.
      clearOfflineQueries();
      return true;
    } catch {
      toast.error("Não foi possível contactar o serviço de autenticação.");
      setSigningOut(false);
      return false;
    }
  };

  const signOutAllDevices = () => signOut("global");

  return { signOut, signOutAllDevices, signingOut };
}
