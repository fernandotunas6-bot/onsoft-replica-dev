import { useState, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  Camera,
  ExternalLink,
  GraduationCap,
  History,
  LoaderCircle,
  QrCode,
  Upload,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { ModalShell, ModalHeader, ModalContent } from "@/components/ui/modal-system";
import { MediaAvatar } from "@/components/ui/media-frame";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import {
  applyLibraryPhotoToPerson,
  uploadPersonPhotoToLibrary,
} from "@/features/arquivos/apply-person-photo";
import { resolvePersonPhotoUrl } from "@/features/arquivos/person-photo-url";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { getStudentProfile, getStudentStatusHistory } from "@/features/students/server";
import { whatsappHref } from "@/features/integrations/actions";
import { StudentDigitalCardModal } from "./StudentDigitalCardModal";
import { StudentStatusBadge } from "./StudentStatusBadge";
import { StudentFinanceBadge } from "./StudentFinanceBadge";
import { StudentStatusHistoryTimeline } from "./StudentStatusHistoryTimeline";
import { formatKz } from "@/features/students/academic-status";
import { sexLabel } from "@/features/people/person-fields";
import { PayflowStudentSyncButton } from "@/features/finance/components/PayflowStudentSyncButton";

export interface StudentExtensiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string | null;
  initialData?: {
    id: string;
    full_name: string;
    registration_number: string;
    photo_url: string | null;
    student_status: string;
    payment_status: string | null;
    grade_name: string | null;
    class_name: string | null;
    academic_year: string | null;
    primary_guardian_name: string | null;
    phone: string | null;
    email: string | null;
    debt_amount?: number;
    overdue_count?: number;
    has_debt?: boolean;
    total_billed?: number;
    total_paid?: number;
  } | null;
}

export function StudentExtensiveModal({
  open,
  onOpenChange,
  studentId,
  initialData,
}: StudentExtensiveModalProps) {
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(
    initialData?.photo_url ?? null,
  );
  const [resolvedPhotoSrc, setResolvedPhotoSrc] = useState<string | null>(null);
  const [showDigitalCard, setShowDigitalCard] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["students", "profile", studentId],
    enabled: Boolean(open && studentId),
    queryFn: () => getStudentProfile({ data: { id: studentId! } }),
  });

  const statusHistoryQuery = useQuery({
    queryKey: ["students", "status-history", studentId],
    enabled: Boolean(open && studentId),
    queryFn: () => getStudentStatusHistory({ data: { studentId: studentId! } }),
  });

  const profile = profileQuery.data;
  const student = profile?.student;
  const guardians = profile?.guardians ?? [];

  const personId = student?.person_id;
  const schoolId = student?.school_id;

  const fullName = student?.full_name || initialData?.full_name || "Aluno";
  const studentNumber = student?.registration_number || initialData?.registration_number || "—";
  const statusKey = student?.student_status || initialData?.student_status || "active";
  const paymentKey = initialData?.payment_status || null;

  useEffect(() => {
    if (student?.photo_url) {
      setCurrentPhotoUrl(student.photo_url);
    } else if (initialData?.photo_url) {
      setCurrentPhotoUrl(initialData.photo_url);
    }
  }, [student?.photo_url, initialData?.photo_url]);

  useEffect(() => {
    if (!currentPhotoUrl) {
      setResolvedPhotoSrc(null);
      return;
    }
    let cancelled = false;
    resolvePersonPhotoUrl(currentPhotoUrl)
      .then((url) => {
        if (!cancelled) setResolvedPhotoSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentPhotoUrl]);

  // Upload direto de foto
  const handleDirectPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file || !personId || isUploadingPhoto) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Por favor seleccione uma imagem válida (PNG, JPEG ou WebP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem não pode ultrapassar 5 MB.");
      return;
    }

    if (!schoolId) {
      toast.error("Sem escola activa para associar a fotografia.");
      return;
    }

    setIsUploadingPhoto(true);
    try {
      // A fotografia vai para a biblioteca privada da escola; o efeito que observa
      // `currentPhotoUrl` trata de assinar a URL para exibição.
      const newPhotoUrl = await uploadPersonPhotoToLibrary({
        file,
        personId,
        schoolId: String(schoolId),
        ownerUserId: account.id,
      });

      setCurrentPhotoUrl(newPhotoUrl);

      // Atualizar caches do TanStack Query
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["students", "profile", studentId] }),
        queryClient.invalidateQueries({ queryKey: ["students", "search"] }),
        queryClient.invalidateQueries({ queryKey: ["people", "get", personId] }),
      ]);

      toast.success("Foto de perfil actualizada com sucesso!");
    } catch (err) {
      toast.error("Erro ao actualizar a foto de perfil", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <ModalShell open={open} onOpenChange={onOpenChange} size="xl" className="overflow-hidden">
      <ModalHeader
        title="Perfil Extensivo do Aluno"
        subtitle="Ficha rápida, dados pessoais, situação pedagógica e fotografia de identificação."
      />

      <ModalContent className="space-y-6 px-6 py-5 max-h-[78vh] overflow-y-auto">
        {/* Banner Superior com Avatar e Identificação Principal */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-5 rounded-2xl bg-gradient-to-br from-primary/5 via-card to-secondary/30 border border-border/80 shadow-xs">
          {/* Avatar com Botão de Carregamento de Imagem */}
          <div className="relative group shrink-0">
            <MediaAvatar
              src={resolvedPhotoSrc}
              alt={fullName}
              className="size-24 rounded-2xl object-cover ring-2 ring-primary/25 shadow-md transition-transform duration-200 group-hover:scale-[1.02]"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPhoto || !personId}
              title="Inserir / Alterar Imagem de Perfil"
              className="absolute -bottom-1.5 -right-1.5 size-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 hover:scale-110 active:scale-95 transition-all cursor-pointer ring-2 ring-background disabled:opacity-50"
            >
              {isUploadingPhoto ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
            </button>
            <input
              aria-label="Carregar fotografia"
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleDirectPhotoUpload}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                {fullName}
              </h2>
              <StudentStatusBadge status={statusKey} size="md" />
              <StudentFinanceBadge
                status={paymentKey}
                debtAmount={initialData?.debt_amount}
                overdueCount={initialData?.overdue_count}
                size="md"
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-mono font-medium text-foreground">
                <span className="text-muted-foreground font-normal">Nº Processo:</span>{" "}
                {studentNumber}
              </span>
              {initialData?.grade_name || student?.grade_name ? (
                <span className="inline-flex items-center gap-1">
                  <GraduationCap className="size-3.5 text-primary" />
                  {initialData?.grade_name || student?.grade_name}
                </span>
              ) : null}
              {initialData?.class_name || student?.class_name ? (
                <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                  Turma {initialData?.class_name || student?.class_name}
                </span>
              ) : null}
            </div>

            {/* Ações Rápidas de Fotografia */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 rounded-lg"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhoto || !personId}
              >
                <Upload className="size-3.5" />
                Carregar Foto do Computador
              </Button>

              {personId && schoolId ? (
                <PickFileButton
                  label="Biblioteca"
                  area="secretaria"
                  acceptKinds={["png", "jpeg"]}
                  variant="outline"
                  size="sm"
                  onPick={(file) => {
                    void (async () => {
                      try {
                        await applyLibraryPhotoToPerson({
                          personId,
                          schoolId: String(schoolId),
                          file,
                        });
                        await Promise.all([
                          queryClient.invalidateQueries({
                            queryKey: ["students", "profile", studentId],
                          }),
                          queryClient.invalidateQueries({ queryKey: ["students", "search"] }),
                          queryClient.invalidateQueries({ queryKey: ["people", "get", personId] }),
                        ]);
                        toast.success("Foto vinculada a partir da biblioteca!");
                      } catch (err) {
                        toast.error("Erro ao aplicar foto da biblioteca");
                      }
                    })();
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>

        {/* Abas Extensivas de Informação */}
        <Tabs defaultValue="pessoal" className="w-full">
          <TabsList className="grid w-full grid-cols-5 h-9">
            <TabsTrigger value="pessoal" className="text-xs sm:text-sm gap-1.5">
              <User className="size-3.5" />
              <span className="hidden sm:inline">Dados</span> Pessoais
            </TabsTrigger>
            <TabsTrigger value="academico" className="text-xs sm:text-sm gap-1.5">
              <GraduationCap className="size-3.5" />
              Matrícula
            </TabsTrigger>
            <TabsTrigger value="encarregados" className="text-xs sm:text-sm gap-1.5">
              <Users className="size-3.5" />
              Encarregados
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="text-xs sm:text-sm gap-1.5">
              <Wallet className="size-3.5" />
              Financeiro
            </TabsTrigger>
            <TabsTrigger value="historico" className="text-xs sm:text-sm gap-1.5">
              <History className="size-3.5" />
              Histórico
            </TabsTrigger>
          </TabsList>

          {/* 1. Dados Pessoais */}
          <TabsContent value="pessoal" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-card border border-border/70">
                <span className="text-xs font-medium text-muted-foreground block">
                  Nome Completo
                </span>
                <span className="text-sm font-semibold text-foreground mt-0.5 block">
                  {fullName}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/70">
                <span className="text-xs font-medium text-muted-foreground block">
                  Bilhete de Identidade / Cédula
                </span>
                <span className="text-sm font-semibold font-mono text-foreground mt-0.5 block">
                  {student?.national_id || "Não registado"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/70">
                <span className="text-xs font-medium text-muted-foreground block">
                  Data de Nascimento
                </span>
                <span className="text-sm font-semibold text-foreground mt-0.5 block">
                  {student?.birth_date
                    ? new Date(student.birth_date).toLocaleDateString("pt-AO")
                    : "—"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/70">
                <span className="text-xs font-medium text-muted-foreground block">Género</span>
                {/* people.sex guarda male/female/other; comparar com "M"/"F" dava sempre «—». */}
                <span className="text-sm font-semibold text-foreground mt-0.5 block">
                  {sexLabel(student?.gender)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/70">
                <span className="text-xs font-medium text-muted-foreground block">Telefone</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-sm font-semibold font-mono text-foreground">
                    {student?.phone || initialData?.phone || "—"}
                  </span>
                  {student?.phone || initialData?.phone ? (
                    <a
                      href={whatsappHref(student?.phone || initialData?.phone || "")}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-success hover:underline"
                    >
                      WhatsApp
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/70">
                <span className="text-xs font-medium text-muted-foreground block">E-mail</span>
                <span className="text-sm font-semibold text-foreground mt-0.5 block truncate">
                  {student?.email || initialData?.email || "—"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/70 sm:col-span-2 lg:col-span-3">
                <span className="text-xs font-medium text-muted-foreground block">
                  Endereço Residencial
                </span>
                <span className="text-sm font-medium text-foreground mt-0.5 block">
                  {[student?.address, student?.commune, student?.municipality, student?.province]
                    .filter(Boolean)
                    .join(" · ") || "Morada não especificada"}
                </span>
              </div>
            </div>
          </TabsContent>

          {/* 2. Matrícula & Turma */}
          <TabsContent value="academico" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-card border border-border/70">
                <span className="text-xs font-medium text-muted-foreground block">
                  Turma Actual
                </span>
                <span className="text-sm font-bold text-primary mt-0.5 block">
                  {initialData?.class_name
                    ? `Turma ${initialData.class_name}`
                    : "Sem turma atribuída"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/70">
                <span className="text-xs font-medium text-muted-foreground block">
                  Classe / Grau
                </span>
                <span className="text-sm font-semibold text-foreground mt-0.5 block">
                  {initialData?.grade_name || "—"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/70">
                <span className="text-xs font-medium text-muted-foreground block">Ano Lectivo</span>
                <span className="text-sm font-semibold font-mono text-foreground mt-0.5 block">
                  {initialData?.academic_year || "—"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/70">
                <span className="text-xs font-medium text-muted-foreground block">
                  Estado da Matrícula
                </span>
                <div className="mt-1.5">
                  <StudentStatusBadge status={statusKey} size="md" />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/70">
                <span className="text-xs font-medium text-muted-foreground block">
                  Data de Admissão
                </span>
                <span className="text-sm font-semibold text-foreground mt-0.5 block">
                  {student?.admitted_on
                    ? new Date(student.admitted_on).toLocaleDateString("pt-AO")
                    : "—"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/70">
                <span className="text-xs font-medium text-muted-foreground block">
                  Assiduidade Registada
                </span>
                <span className="text-sm font-semibold text-foreground mt-0.5 block">
                  {student?.attendance_rate !== null && student?.attendance_rate !== undefined
                    ? `${student.attendance_rate}%`
                    : "Regular"}
                </span>
              </div>
            </div>
          </TabsContent>

          {/* 3. Encarregados */}
          <TabsContent value="encarregados" className="space-y-4 pt-4">
            <div className="p-4 rounded-xl bg-card border border-border/70 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-muted-foreground block">
                    Encarregado Principal
                  </span>
                  <span className="text-base font-bold text-foreground">
                    {initialData?.primary_guardian_name || "Nenhum encarregado vinculado"}
                  </span>
                </div>
                {initialData?.primary_guardian_name ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                    Responsável
                  </span>
                ) : null}
              </div>

              {guardians.length > 0 ? (
                <div className="divide-y divide-border/50 pt-2">
                  {guardians.map((g, i) => (
                    <div
                      key={i}
                      className="py-2 flex items-center justify-between text-xs sm:text-sm"
                    >
                      <span className="font-medium text-foreground">
                        {g.relationship || "Encarregado(a)"}
                      </span>
                      <span className="text-muted-foreground">
                        {g.is_primary ? "Responsável Financeiro" : "Contacto Autorizado"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </TabsContent>

          {/* 4. Financeiro */}
          <TabsContent value="financeiro" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-card border border-border/70 space-y-2">
                <span className="text-xs font-medium text-muted-foreground block">
                  Situação das Propinas
                </span>
                <StudentFinanceBadge
                  status={paymentKey}
                  debtAmount={initialData?.debt_amount}
                  overdueCount={initialData?.overdue_count}
                  size="lg"
                />
                {initialData?.debt_amount && initialData.debt_amount > 0 ? (
                  <p className="text-xs text-destructive font-medium mt-1">
                    Em atraso: {formatKz(initialData.debt_amount)}
                    {initialData.overdue_count ? ` · ${initialData.overdue_count} fatura(s)` : ""}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground mt-2">
                  As cobranças e recibos podem ser emitidos diretamente a partir da ficha completa
                  do aluno.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-card border border-border/70 space-y-2">
                <span className="text-xs font-medium text-muted-foreground block">
                  Resumo Financeiro
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Facturado</span>
                    <span className="font-semibold font-mono text-foreground">
                      {formatKz(initialData?.total_billed ?? 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Pago</span>
                    <span className="font-semibold font-mono text-foreground">
                      {formatKz(initialData?.total_paid ?? 0)}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground block pt-1">
                  Moeda oficial: Kwanzas (AOA)
                </span>
              </div>
            </div>
            {studentId ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card p-3">
                <PayflowStudentSyncButton studentId={studentId} />
                <p className="text-xs text-muted-foreground">
                  Envia escola, aluno, faturas e IBAN para o PayFlow (servidor a servidor).
                </p>
              </div>
            ) : null}
          </TabsContent>

          {/* 5. Histórico de estados */}
          <TabsContent value="historico" className="space-y-4 pt-4">
            <StudentStatusHistoryTimeline
              events={statusHistoryQuery.data ?? []}
              isLoading={statusHistoryQuery.isLoading}
            />
          </TabsContent>
        </Tabs>
      </ModalContent>

      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border bg-secondary/15">
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>

        <div className="flex items-center gap-2">
          {studentId ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 font-medium"
                onClick={() => setShowDigitalCard(true)}
              >
                <QrCode className="size-3.5 text-primary" />
                Cartão Digital
              </Button>
              <Button asChild variant="default" size="sm" className="gap-1.5 font-semibold">
                <Link to="/alunos/$studentId" params={{ studentId }}>
                  <ExternalLink className="size-3.5" />
                  Abrir Ficha Completa
                </Link>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {studentId ? (
        <StudentDigitalCardModal
          open={showDigitalCard}
          onOpenChange={setShowDigitalCard}
          student={{
            id: studentId,
            full_name: fullName,
            process_number: studentNumber,
            class_name: initialData?.class_name || student?.class_name || undefined,
            academic_year: initialData?.academic_year || undefined,
            photo_url: resolvedPhotoSrc || currentPhotoUrl,
            status: statusKey,
          }}
        />
      ) : null}
    </ModalShell>
  );
}
