import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function useSignOut() {
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async (scope: "local" | "global" = "local") => {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut({ scope });
    if (error) {
      toast.error("Não foi possível terminar a sessão.");
      setSigningOut(false);
      return;
    }
    queryClient.clear();
  };

  const signOutAllDevices = () => signOut("global");

  return { signOut, signOutAllDevices, signingOut };
}
