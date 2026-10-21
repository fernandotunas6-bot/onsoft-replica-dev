import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useSignOut } from "@/features/auth/use-sign-out";
import { getStudentWebsitePage } from "./student-portal-server";
import { getSigaLoginUrl } from "@/lib/ecosystem-urls";
import { isStudentPortalRequest, studentPortalFramePath } from "./student-portal-bridge";

/** The school website owns its presentation; SIGA owns authentication, membership and data. */
export function StudentWebsitePortal() {
  const account = useCurrentAccount();
  const { selectedYearLabel } = useSchoolSettings();
  const queryClient = useQueryClient();
  const { signOut } = useSignOut();
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const eligible =
    account.role === "Aluno" && Boolean(account.schoolId && account.schoolSlug && account.id);
  const source =
    typeof window !== "undefined" && eligible
      ? studentPortalFramePath(window.location.origin, account.schoolSlug || "", getSigaLoginUrl())
      : null;
  useEffect(() => {
    if (!eligible || !source) return;
    let active = true;
    setReady(false);
    setFrameError(false);
    const timer = window.setTimeout(() => {
      if (active) setFrameError(true);
    }, 20000);
    async function receive(event: MessageEvent) {
      const target = frame.current?.contentWindow ?? null;
      if (!isStudentPortalRequest(event, target, window.location.origin, account.schoolSlug || ""))
        return;
      clearTimeout(timer);
      setFrameError(false);
      setReady(true);
      const request = event.data;
      if (request.action === "signout") {
        await signOut();
        return;
      }
      try {
        const page = await queryClient.fetchQuery({
          queryKey: [
            "school-student-portal",
            account.id,
            account.schoolId,
            account.activeStudentId,
            selectedYearLabel,
            request.section,
          ],
          queryFn: () =>
            getStudentWebsitePage({
              data: { schoolId: account.schoolId!, section: request.section },
            }),
          staleTime: 30000,
          retry: false,
        });
        if (!active || target !== frame.current?.contentWindow) return;
        target?.postMessage(
          {
            type: "siga-student-response",
            version: 1,
            requestId: request.requestId,
            schoolSlug: account.schoolSlug,
            section: request.section,
            ok: true,
            data: {
              name: account.name,
              email: account.email,
              schoolName: account.schoolName,
              yearLabel: selectedYearLabel,
              ...page,
            },
          },
          window.location.origin,
        );
      } catch {
        if (active && target === frame.current?.contentWindow)
          target?.postMessage(
            {
              type: "siga-student-response",
              version: 1,
              requestId: request.requestId,
              schoolSlug: account.schoolSlug,
              section: request.section,
              ok: false,
            },
            window.location.origin,
          );
      }
    }
    const listener = (event: MessageEvent) => {
      void receive(event);
    };
    window.addEventListener("message", listener);
    frame.current?.contentWindow?.postMessage(
      { type: "siga-student-init", schoolSlug: account.schoolSlug },
      window.location.origin,
    );
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("message", listener);
    };
    // Account identity and school/year changes reset the document and discard older replies.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signOut and account helpers are recreated by existing hooks.
  }, [
    eligible,
    source,
    account.id,
    account.schoolId,
    account.activeStudentId,
    account.name,
    account.email,
    account.schoolName,
    selectedYearLabel,
    queryClient,
  ]);
  if (account.profile.isPending)
    return (
      <p role="status" className="p-6 text-sm">
        A verificar a conta académica…
      </p>
    );
  if (!eligible)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">Este portal destina-se a estudantes.</h1>
        <p>
          Entre com uma conta de estudante vinculada à escola. Docentes e administração têm o seu
          espaço no SIGA Plus.
        </p>
        <a
          className="text-primary underline"
          href={`/portal${account.schoolSlug ? `?escola=${encodeURIComponent(account.schoolSlug)}` : ""}`}
        >
          Abrir o meu portal SIGA
        </a>
      </main>
    );
  return (
    <div className="min-h-dvh bg-background">
      {!ready && (
        <main className="p-6">
          <p role="status">A abrir o seu portal de estudante…</p>
          {frameError && (
            <p role="alert">
              Não foi possível carregar o website da escola.{" "}
              <a className="text-primary underline" href="/portal">
                Abrir o portal SIGA
              </a>
            </p>
          )}
        </main>
      )}
      {source && (
        <iframe
          key={JSON.stringify([
            account.schoolId,
            account.schoolSlug,
            account.id,
            account.activeStudentId,
            selectedYearLabel,
            account.name,
            account.email,
            account.schoolName,
          ])}
          ref={frame}
          src={source}
          title={`Portal do estudante · ${account.schoolName}`}
          referrerPolicy="same-origin"
          style={{
            border: 0,
            width: "100%",
            height: "100dvh",
            display: "block",
            visibility: ready ? "visible" : "hidden",
            position: ready ? "relative" : "absolute",
          }}
        />
      )}
    </div>
  );
}
