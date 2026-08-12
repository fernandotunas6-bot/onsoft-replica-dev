import { useQuery } from "@tanstack/react-query";
import { useAuthSession } from "@/components/auth/AuthGate";
import { getCurrentAccountContext } from "@/features/auth/server";

export function useCurrentAccount() {
  const session = useAuthSession();
  const userId = session?.user.id;
  const profile = useQuery({
    queryKey: ["auth", "account-context", userId ?? "anon"],
    enabled: Boolean(userId),
    queryFn: async () => {
      try {
        return await getCurrentAccountContext();
      } catch (error) {
        console.error("[useCurrentAccount]", error);
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: 2,
    retryDelay: (attempt) => 400 * (attempt + 1),
  });

  const email = session?.user.email ?? "Conta autenticada";
  const metaName =
    typeof session?.user.user_metadata?.["full_name"] === "string"
      ? session.user.user_metadata["full_name"]
      : null;
  const fallbackName = session?.user.email?.split("@")[0] || "Utilizador";
  const name = profile.data?.full_name || metaName || fallbackName;
  const role = profile.data?.cargo || "Utilizador";
  const avatarUrl = profile.data?.avatar_url || null;
  const phone = profile.data?.phone || null;
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  return {
    id: userId ?? "",
    email,
    name,
    phone,
    role,
    avatarUrl,
    initials,
    grants: profile.data?.grants ?? {},
    profile,
  };
}
