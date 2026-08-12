import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function useSignOut() {
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Não foi possível terminar a sessão.");
      setSigningOut(false);
      return;
    }
    queryClient.clear();
  };

  return { signOut, signingOut };
}
