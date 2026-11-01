import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, ExternalLink, Globe, GraduationCap } from "lucide-react";
import { getMySchoolAddresses, type SchoolAddresses } from "./school-addresses-server";

export const SCHOOL_ADDRESSES_QUERY_KEY = ["school", "addresses"] as const;

/**
 * Ligações para o website da escola e o portal SIGA Plus. Só para o
 * Administrador (o servidor recusa os outros papéis); sem dados, não mostra nada.
 */
export function SchoolAddressLinks({ enabled = true }: { enabled?: boolean }) {
  const fetchAddresses = useServerFn(getMySchoolAddresses);
  const query = useQuery({
    queryKey: SCHOOL_ADDRESSES_QUERY_KEY,
    enabled,
    queryFn: () => fetchAddresses() as Promise<SchoolAddresses | null>,
    staleTime: 5 * 60_000,
  });
  if (!query.data) return null;
  const links = [
    {
      href: query.data.websiteUrl,
      label: "Website da escola",
      hint: "Página pública da instituição",
      icon: Globe,
    },
    {
      href: query.data.portalUrl,
      label: "Portal SIGA Plus",
      hint: "Entrada da equipa, alunos e encarregados",
      icon: GraduationCap,
    },
    ...(query.data.enrollmentUrl
      ? [
          {
            href: query.data.enrollmentUrl,
            label: "Inscrições online",
            hint: "Formulário oficial ligado ao website",
            icon: ClipboardList,
          },
        ]
      : []),
  ];
  return (
    <ul className="grid min-w-0 gap-2 text-sm" aria-label="Endereços da escola">
      {links.map(({ href, label, hint, icon: Icon }) => (
        <li key={label} className="min-w-0">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-w-0 items-start gap-2 rounded-md py-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1">
                {label}
                <ExternalLink className="size-3 shrink-0 opacity-60" aria-hidden />
                <span className="sr-only">(abre noutro separador)</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground" title={href}>
                {hint} · {href.replace(/^https?:\/\//, "")}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
