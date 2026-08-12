import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, GraduationCap, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AngolaIdentityField } from "@/components/forms/AngolaIdentityField";
import { AngolaPhoneField } from "@/components/forms/AngolaPhoneField";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPublicEnrollmentForm, submitPublicEnrollment } from "@/features/enrollment/server";
import type { EnrollmentVisibleField } from "@/features/enrollment/schemas";
import { overlayTalao } from "@/features/documents/print-overlays";
import { printBundledTemplate } from "@/features/documents/print-issue-loader";
import { whatsappHref } from "@/features/integrations/actions";

export const Route = createFileRoute("/matricula/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Matrícula · ${params.slug}` },
      {
        name: "description",
        content: "Formulário público de candidatura a matrícula.",
      },
    ],
  }),
  component: PublicEnrollmentPage,
});

function hasField(fields: unknown, name: EnrollmentVisibleField) {
  return Array.isArray(fields) && fields.includes(name);
}

function PublicEnrollmentPage() {
  const { slug } = Route.useParams();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<{
    fullName: string;
    guardianName?: string;
    guardianPhone?: string;
  } | null>(null);
  const formQuery = useQuery({
    queryKey: ["enrollment", "public", slug],
    queryFn: () => getPublicEnrollmentForm({ data: { slug } }),
    retry: false,
  });
  const form = formQuery.data;
  const accent = form?.accent_color || "#1d4ed8";
  const schoolWhatsapp = form?.school_phone
    ? whatsappHref(
        form.school_phone,
        `Olá, gostaria de saber mais sobre a matrícula em ${form?.school_name ?? "SIGA"}.`,
      )
    : null;
  const schoolMailto = form?.school_email
    ? `mailto:${form.school_email}?subject=${encodeURIComponent(`Matrícula — ${form?.school_name ?? "SIGA"}`)}&body=${encodeURIComponent("Olá, gostaria de saber mais sobre a candidatura.")}`
    : null;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const fullName = String(data.get("full_name") ?? "");
      const guardianName = String(data.get("guardian_name") || "") || undefined;
      const guardianPhone = String(data.get("guardian_phone") || "") || undefined;
      await submitPublicEnrollment({
        data: {
          slug,
          person: {
            full_name: fullName,
            birth_date: String(data.get("birth_date") || "") || undefined,
            sex: (String(data.get("sex") || "") || undefined) as "M" | "F" | "outro" | undefined,
            phone_primary: String(data.get("phone_primary") || "") || undefined,
            email: String(data.get("email") || "") || undefined,
            address: String(data.get("address") || "") || undefined,
            nif: String(data.get("nif") || "") || undefined,
            notes: String(data.get("notes") || "") || undefined,
          },
          guardianName,
          guardianPhone,
          guardianRelationship: String(data.get("guardian_relationship") || "") || undefined,
        },
      });
      setReceipt({ fullName, guardianName, guardianPhone });
      setSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível enviar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--accent)_18%,transparent),transparent_42%),linear-gradient(180deg,var(--background),var(--secondary)/35%)]">
      <style>{`:root { --accent: ${accent}; }`}</style>
      <div className="mx-auto grid min-h-screen max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-3 rounded-2xl bg-primary px-3 py-2 text-primary-foreground shadow-lg">
            <GraduationCap className="size-5" />
            <span className="text-sm font-extrabold tracking-wide">
              {form?.school_name ?? "SIGA"}
            </span>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Candidatura pública
            </p>
            <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
              {form?.title ?? "Matrícula"}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              {form?.hero_text ??
                form?.subtitle ??
                "Preencha os dados do aluno. A secretaria confirma a matrícula."}
            </p>
            {schoolWhatsapp || schoolMailto ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {schoolWhatsapp ? (
                  <Button variant="outline" asChild>
                    <a href={schoolWhatsapp} target="_blank" rel="noreferrer">
                      WhatsApp da secretaria
                    </a>
                  </Button>
                ) : null}
                {schoolMailto ? (
                  <Button variant="outline" asChild>
                    <a href={schoolMailto}>E-mail da secretaria</a>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card/95 p-6 shadow-2xl backdrop-blur">
          {formQuery.isLoading ? (
            <div className="flex justify-center py-16">
              <LoaderCircle className="size-7 animate-spin text-primary" />
            </div>
          ) : formQuery.isError ? (
            <p className="py-10 text-center text-sm text-destructive">
              {formQuery.error instanceof Error ? formQuery.error.message : "Link indisponível."}
            </p>
          ) : sent ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto size-10 text-primary" />
              <h2 className="mt-4 font-display text-2xl font-extrabold">Candidatura enviada</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                A secretaria vai rever os dados e contactá-lo para confirmar a matrícula.
              </p>
              {receipt ? (
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      void printBundledTemplate({
                        key: "talao-candidatura",
                        school: { name: form?.school_name ?? "Escola" },
                        student: {
                          fullName: receipt.fullName,
                          academicNumber: "CAND",
                        },
                        overlay: overlayTalao({
                          kind: "candidatura",
                          fullName: receipt.fullName,
                          guardianName: receipt.guardianName,
                          guardianPhone: receipt.guardianPhone,
                        }),
                      }).catch((printError) =>
                        setError(
                          printError instanceof Error
                            ? printError.message
                            : "Não foi possível imprimir o talão.",
                        ),
                      );
                    }}
                  >
                    Imprimir talão
                  </Button>
                  {schoolWhatsapp || schoolMailto ? (
                    <>
                      {schoolWhatsapp ? (
                        <Button variant="outline" asChild>
                          <a href={schoolWhatsapp} target="_blank" rel="noreferrer">
                            Contactar secretaria
                          </a>
                        </Button>
                      ) : null}
                      {schoolMailto ? (
                        <Button variant="outline" asChild>
                          <a href={schoolMailto}>E-mail da secretaria</a>
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
              <div>
                <h2 className="font-display text-xl font-extrabold">Dados do aluno</h2>
                {form?.subtitle ? (
                  <p className="mt-1 text-sm text-muted-foreground">{form.subtitle}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Nome completo</Label>
                <Input id="full_name" name="full_name" required minLength={2} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {hasField(form?.visible_fields, "birth_date") ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="birth_date">Data de nascimento</Label>
                    <Input id="birth_date" name="birth_date" type="date" />
                  </div>
                ) : null}
                {hasField(form?.visible_fields, "sex") ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="sex">Género</Label>
                    <select
                      id="sex"
                      name="sex"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">—</option>
                      <option value="F">Feminino</option>
                      <option value="M">Masculino</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                ) : null}
                {hasField(form?.visible_fields, "phone_primary") ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="phone_primary">Telefone</Label>
                    <AngolaPhoneField id="phone_primary" name="phone_primary" />
                  </div>
                ) : null}
                {hasField(form?.visible_fields, "email") ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" />
                  </div>
                ) : null}
                {hasField(form?.visible_fields, "nif") ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="nif">NIF / BI</Label>
                    <AngolaIdentityField id="nif" name="nif" />
                  </div>
                ) : null}
              </div>
              {hasField(form?.visible_fields, "address") ? (
                <div className="space-y-1.5">
                  <Label htmlFor="address">Morada</Label>
                  <Input id="address" name="address" />
                </div>
              ) : null}
              {hasField(form?.visible_fields, "guardian_name") ||
              hasField(form?.visible_fields, "guardian_phone") ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {hasField(form?.visible_fields, "guardian_name") ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="guardian_name">Encarregado</Label>
                      <Input id="guardian_name" name="guardian_name" />
                    </div>
                  ) : null}
                  {hasField(form?.visible_fields, "guardian_phone") ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="guardian_phone">Telefone do encarregado</Label>
                      <Input id="guardian_phone" name="guardian_phone" />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {hasField(form?.visible_fields, "guardian_relationship") ? (
                <div className="space-y-1.5">
                  <Label htmlFor="guardian_relationship">Parentesco</Label>
                  <Input id="guardian_relationship" name="guardian_relationship" />
                </div>
              ) : null}
              {hasField(form?.visible_fields, "notes") ? (
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notas</Label>
                  <Textarea id="notes" name="notes" />
                </div>
              ) : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "A enviar…" : "Enviar candidatura"}
              </Button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
