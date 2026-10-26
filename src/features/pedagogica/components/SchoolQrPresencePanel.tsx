import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import {
  CheckCircle2,
  ChevronDown,
  Expand,
  MapPin,
  Printer,
  RefreshCw,
  ScanLine,
  Settings2,
  ShieldAlert,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { moduleIcons } from "@/lib/app-icons";
import { TeacherWeekPresenceReport } from "@/features/pedagogica/components/TeacherWeekPresenceReport";
import {
  PRESENCE_SCAN_REASON_SHORT,
  SCHOOL_PRESENCE_MODE_LABELS,
  addDays,
  luandaDateOf,
  luandaTimeOfMs,
  mondayOf,
  rotatingSchoolQrAt,
  type SchoolPresenceMode,
} from "@/features/pedagogica/school-qr";
import {
  getPrintableSchoolQr,
  getSchoolPresenceConfig,
  getSchoolQrDisplayKeys,
  listPresenceScans,
  reviewPresenceScan,
  updateSchoolPresenceConfig,
  type PresenceScanRow,
  type SchoolPresenceConfig,
} from "@/features/pedagogica/school-qr-server";

const MODE_HELP: Record<SchoolPresenceMode, string> = {
  qr: "O professor lê o QR no telemóvel. O botão deixa de contar.",
  button: "O professor toca «Estou na sala». Não prova que está na escola.",
  off: "Ninguém confirma. A chamada dos alunos continua.",
};

/** Painel da Direcção: definições, ecrã do QR, QR impresso e leituras por rever. */
export function SchoolQrPresencePanel() {
  const config = useQuery({
    queryKey: ["school-presence-config"],
    queryFn: () => getSchoolPresenceConfig(),
    retry: false,
  });
  const [kioskOpen, setKioskOpen] = useState(false);
  // Fechadas quando a escola já está configurada; abertas enquanto falta a zona.
  const [settingsOpen, setSettingsOpen] = useState<boolean | null>(null);

  if (config.isLoading) {
    return (
      <Panel title="QR da escola" icon={moduleIcons.qrPresence}>
        <p className="text-sm text-muted-foreground">A carregar…</p>
      </Panel>
    );
  }
  if (config.error || !config.data) {
    return (
      <Panel title="QR da escola" icon={moduleIcons.qrPresence}>
        <EmptyState
          title="Sem acesso ao QR da escola"
          description={
            config.error instanceof Error ? config.error.message : "Tente novamente mais tarde."
          }
        />
      </Panel>
    );
  }
  const data = config.data;
  const settingsShown = settingsOpen ?? !data.center;

  return (
    <div className="space-y-6">
      {!data.available ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">
          O QR da escola ainda não está activo: falta aplicar o SQL{" "}
          <code>docs/agents/SIGA_aplicar_qr_escola.sql</code> no Supabase. Até lá, os professores
          confirmam com o botão «Estou na sala».
        </div>
      ) : null}

      <Panel
        title="QR da escola"
        description="Um QR único para todos os professores, gerado aqui."
        icon={moduleIcons.qrPresence}
        action={
          <div className="flex flex-wrap gap-2">
            <PrintableQrButton disabled={!data.available || !data.allowPrinted} />
            <Button
              type="button"
              className="gap-1.5"
              disabled={!data.available || data.mode !== "qr"}
              onClick={() => setKioskOpen(true)}
            >
              <Expand className="size-4" /> Mostrar QR no ecrã
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <SummaryChip tone={data.mode === "qr" ? "primary" : "muted"}>
            {SCHOOL_PRESENCE_MODE_LABELS[data.mode]}
          </SummaryChip>
          <SummaryChip tone={data.center ? "muted" : "warning"}>
            <MapPin className="size-3.5" />
            {data.center ? `Zona de ${data.radiusM} m` : "Zona por definir"}
          </SummaryChip>
          <SummaryChip tone="muted">
            <WifiOff className="size-3.5" />
            Sem rede até {data.offlineMaxHours} h
          </SummaryChip>
          {data.available ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto gap-1.5"
              aria-expanded={settingsShown}
              onClick={() => setSettingsOpen(!settingsShown)}
            >
              <Settings2 className="size-4" />
              {settingsShown ? "Fechar definições" : "Definições"}
            </Button>
          ) : null}
        </div>
        {data.mode !== "qr" && data.available && !settingsShown ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Para mostrar o QR, escolha «{SCHOOL_PRESENCE_MODE_LABELS.qr}» nas definições.
          </p>
        ) : null}
        {data.available && settingsShown ? (
          <div className="mt-4 border-t pt-4">
            <SchoolPresenceSettingsForm config={data} onSaved={() => setSettingsOpen(false)} />
          </div>
        ) : null}
      </Panel>

      {data.available ? <PresenceScansReview /> : null}
      <TeacherWeekPresenceReport />
      {kioskOpen ? <SchoolQrKiosk onClose={() => setKioskOpen(false)} /> : null}
    </div>
  );
}

function SummaryChip({
  tone,
  children,
}: {
  tone: "primary" | "muted" | "warning";
  children: ReactNode;
}) {
  const color =
    tone === "primary"
      ? "bg-primary-soft text-primary-strong"
      : tone === "warning"
        ? "bg-warning/10 text-warning-strong"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${color}`}
    >
      {children}
    </span>
  );
}

// ── Definições ────────────────────────────────────────────────────────────────

function SchoolPresenceSettingsForm({
  config,
  onSaved,
}: {
  config: SchoolPresenceConfig & { canEdit: boolean };
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<SchoolPresenceMode>(config.mode);
  const [center, setCenter] = useState(config.center);
  const [radius, setRadius] = useState(String(config.radiusM));
  const [allowPrinted, setAllowPrinted] = useState(config.allowPrinted);
  const [requireLocation, setRequireLocation] = useState(config.requireLocation);
  const [rotation, setRotation] = useState(String(config.rotationSeconds));
  const [offlineHours, setOfflineHours] = useState(String(config.offlineMaxHours));
  const [locating, setLocating] = useState(false);
  // Anular é irreversível (ecrãs e folhas impressas deixam de valer): pede um segundo toque.
  const [confirmRotate, setConfirmRotate] = useState(false);
  const disabled = !config.canEdit;

  const save = useMutation({
    mutationFn: (rotateSecret: boolean) =>
      updateSchoolPresenceConfig({
        data: {
          mode,
          center,
          radiusM: clampInt(radius, 50, 5000, 250),
          allowPrinted,
          requireLocation,
          rotationSeconds: clampInt(rotation, 15, 300, 30),
          offlineMaxHours: clampInt(offlineHours, 1, 168, 72),
          rotateSecret,
        },
      }),
    onSuccess: (_, rotateSecret) => {
      setConfirmRotate(false);
      if (!rotateSecret) onSaved();
      toast.success(rotateSecret ? "QR anulados e renovados" : "Definições guardadas", {
        description: rotateSecret
          ? "Os QR mostrados ou impressos antes deixam de valer. Volte a abrir o ecrã do QR."
          : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ["school-presence-config"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher-attendance-sessions"] });
    },
    onError: (error) =>
      toast.error("Não foi possível guardar", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      }),
  });

  const useHere = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Este aparelho não dá a localização.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        if (position.coords.accuracy > 150) {
          toast.warning("Localização pouco precisa", {
            description: `Precisão de ${Math.round(position.coords.accuracy)} m. Tente ao ar livre, no pátio da escola.`,
          });
        }
        setCenter({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        });
      },
      (error) => {
        setLocating(false);
        toast.error("Não foi possível obter a localização", { description: error.message });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  return (
    <>
      {config.canEdit ? null : (
        <p className="mb-4 text-xs text-muted-foreground">Só a Direcção muda estas regras.</p>
      )}
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(false);
        }}
      >
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-semibold">Como confirmam os professores</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["qr", "button", "off"] as const).map((value) => (
              <label
                key={value}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors ${
                  mode === value ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="radio"
                    name="presence-mode"
                    aria-label={SCHOOL_PRESENCE_MODE_LABELS[value]}
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="accent-primary"
                  />
                  {SCHOOL_PRESENCE_MODE_LABELS[value]}
                </span>
                <span className="text-xs text-muted-foreground">{MODE_HELP[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-semibold">Zona da escola</legend>
          <p className="text-xs text-muted-foreground">
            No pátio da escola, toque «Usar a minha localização».
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={useHere}
              disabled={disabled || locating}
            >
              <MapPin className="size-4" />
              {locating ? "A localizar…" : "Usar a minha localização"}
            </Button>
            <div className="space-y-1">
              <Label htmlFor="presence-radius">Raio (metros)</Label>
              <Input
                id="presence-radius"
                inputMode="numeric"
                className="w-28"
                value={radius}
                onChange={(event) => setRadius(event.target.value)}
              />
            </div>
            {center ? (
              <p className="pb-2 text-xs text-muted-foreground">
                Zona definida
                <button
                  type="button"
                  className="ml-1 underline"
                  onClick={() => setCenter(null)}
                  disabled={disabled}
                >
                  limpar
                </button>
              </p>
            ) : (
              <p className="pb-2 text-xs text-warning-strong">Zona por definir</p>
            )}
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2" disabled={disabled}>
          <ToggleRow
            id="presence-require-location"
            label="Pedir a localização em todas as leituras"
            hint="Sem localização, a leitura fica por rever."
            checked={requireLocation}
            onChange={setRequireLocation}
            disabled={disabled}
          />
          <ToggleRow
            id="presence-allow-printed"
            label="Aceitar o QR impresso da semana"
            hint="Para escolas sem ecrã; só vale dentro da zona."
            checked={allowPrinted}
            onChange={setAllowPrinted}
            disabled={disabled}
          />
          <div className="space-y-1">
            <Label htmlFor="presence-rotation">O QR do ecrã muda a cada (segundos)</Label>
            <Input
              id="presence-rotation"
              inputMode="numeric"
              className="w-28"
              value={rotation}
              onChange={(event) => setRotation(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="presence-offline">Leituras sem rede valem até (horas)</Label>
            <Input
              id="presence-offline"
              inputMode="numeric"
              className="w-28"
              value={offlineHours}
              onChange={(event) => setOfflineHours(event.target.value)}
            />
          </div>
        </fieldset>

        {config.canEdit ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            {confirmRotate ? (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <span className="text-xs text-destructive">
                  Os QR no ecrã e impressos deixam de valer já.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={save.isPending}
                  onClick={() => save.mutate(true)}
                >
                  Sim, anular
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmRotate(false)}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="gap-1.5 text-destructive"
                disabled={save.isPending}
                onClick={() => setConfirmRotate(true)}
              >
                <ShieldAlert className="size-4" /> Anular todos os QR
              </Button>
            )}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "A guardar…" : "Guardar"}
            </Button>
          </div>
        ) : null}
      </form>
    </>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function clampInt(raw: string, min: number, max: number, fallback: number) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

// ── Ecrã do QR (funciona sem rede) ────────────────────────────────────────────

type KioskCache = {
  schoolId: string;
  rotationSeconds: number;
  /** Diferença entre o relógio do servidor e o deste aparelho. */
  offsetMs: number;
  keys: Array<{ date: string; key: string }>;
  savedAtMs: number;
};

const KIOSK_CACHE_KEY = "siga.presence.kiosk.v1";

function readKioskCache(): KioskCache | null {
  try {
    const raw = window.localStorage.getItem(KIOSK_CACHE_KEY);
    return raw ? (JSON.parse(raw) as KioskCache) : null;
  } catch {
    return null;
  }
}

function writeKioskCache(cache: KioskCache) {
  try {
    window.localStorage.setItem(KIOSK_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Sem armazenamento: o ecrã funciona enquanto estiver aberto.
  }
}

/**
 * Ecrã inteiro com o QR rotativo. Recebe do servidor as chaves de hoje e de amanhã
 * e gera o QR no próprio aparelho, por isso continua a funcionar sem internet.
 */
function SchoolQrKiosk({ onClose }: { onClose: () => void }) {
  const [cache, setCache] = useState<KioskCache | null>(() => readKioskCache());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [image, setImage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [expiresAtMs, setExpiresAtMs] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastStep = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshKeys = useCallback(async () => {
    try {
      const startedAt = Date.now();
      const result = await getSchoolQrDisplayKeys();
      const roundTrip = Date.now() - startedAt;
      const next: KioskCache = {
        schoolId: result.schoolId,
        rotationSeconds: result.rotationSeconds,
        offsetMs: result.serverNowMs + roundTrip / 2 - Date.now(),
        keys: result.keys,
        savedAtMs: Date.now(),
      };
      writeKioskCache(next);
      setCache(next);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Sem ligação ao servidor.");
    }
  }, []);

  useEffect(() => {
    void refreshKeys();
    const keysTimer = window.setInterval(() => void refreshKeys(), 30 * 60_000);
    const tick = window.setInterval(() => setNowMs(Date.now()), 500);
    const goOnline = () => {
      setOnline(true);
      void refreshKeys();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Manter o ecrã ligado enquanto o QR está à vista.
    let wakeLock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock
      ?.request("screen")
      .then((lock) => {
        wakeLock = lock;
      })
      .catch(() => undefined);
    return () => {
      window.clearInterval(keysTimer);
      window.clearInterval(tick);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      void wakeLock?.release().catch(() => undefined);
    };
  }, [refreshKeys]);

  const schoolNow = nowMs + (cache?.offsetMs ?? 0);
  const today = luandaDateOf(schoolNow);
  const dayKey = cache?.keys.find((entry) => entry.date === today)?.key ?? null;

  useEffect(() => {
    if (!cache || !dayKey) return;
    let cancelled = false;
    void rotatingSchoolQrAt({
      schoolId: cache.schoolId,
      dayKey,
      rotationSeconds: cache.rotationSeconds,
      nowMs: schoolNow,
    }).then(async (qr) => {
      if (cancelled || lastStep.current === qr.token) return;
      lastStep.current = qr.token;
      setExpiresAtMs(qr.expiresAtMs);
      const url = await QRCode.toDataURL(qr.token, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 640,
      });
      if (!cancelled) setImage(url);
    });
    return () => {
      cancelled = true;
    };
  }, [cache, dayKey, schoolNow]);

  const total = (cache?.rotationSeconds ?? 30) * 1000;
  const remaining = Math.max(0, expiresAtMs - schoolNow);
  const progress = expiresAtMs ? Math.min(100, (remaining / total) * 100) : 0;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="QR da escola"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background p-4"
    >
      <div className="absolute right-4 top-4 flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => void rootRef.current?.requestFullscreen?.().catch(() => undefined)}
        >
          <Expand className="size-4" /> Ecrã inteiro
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
          <X className="size-5" />
        </Button>
      </div>

      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Presença dos professores
        </p>
        <p className="mt-1 text-5xl font-bold tabular-nums">{luandaTimeOfMs(schoolNow)}</p>
      </div>

      {dayKey && image ? (
        <div className="flex flex-col items-center gap-3">
          {/* Fundo em CSS: troca de 30 em 30 s sem piscar (o PNG já traz a margem branca). */}
          <div
            role="img"
            aria-label="QR de presença da escola"
            className="size-[min(70vw,60vh)] rounded-2xl border bg-background bg-contain bg-center bg-no-repeat p-2 shadow-sm"
            style={{ backgroundImage: `url(${image})` }}
          />
          <div className="h-1.5 w-[min(70vw,60vh)] overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-500 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center text-base text-muted-foreground">
            Abra o SIGA no telemóvel → <strong>Ler QR da escola</strong> e aponte a câmara.
          </p>
        </div>
      ) : (
        <EmptyState
          title={cache ? "Sem chave para hoje" : "A preparar o QR…"}
          description={
            loadError ??
            "Ligue este aparelho à internet uma vez: depois o QR funciona o dia todo sem rede."
          }
        />
      )}

      {!online ? (
        <p className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          <WifiOff className="size-3.5" /> Sem internet: o QR continua válido
        </p>
      ) : null}
    </div>
  );
}

// ── QR impresso ───────────────────────────────────────────────────────────────

function PrintableQrButton({ disabled }: { disabled: boolean }) {
  const print = useMutation({
    mutationFn: async (week: "current" | "next") => {
      const result = await getPrintableSchoolQr({ data: { week } });
      const image = await QRCode.toDataURL(result.token, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 900,
      });
      return { ...result, image };
    },
    onSuccess: (result) => {
      if (!result.zoneConfigured) {
        toast.warning("Zona da escola por definir", {
          description: "Sem a zona, as leituras do QR impresso ficam todas por rever.",
        });
      }
      const popup = window.open("", "_blank", "noopener=no,width=800,height=1000");
      if (!popup) {
        toast.error("O navegador bloqueou a janela de impressão.");
        return;
      }
      const fmt = (iso: string) => iso.split("-").reverse().join("/");
      popup.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8">
<title>QR de presença · ${fmt(result.monday)}</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:32px;color:#111}
#qr img{width:80%;max-width:640px}h1{margin:0 0 8px;font-size:28px}p{margin:6px 0;font-size:16px}
.small{color:#555;font-size:13px}</style></head><body>
<h1>Presença dos professores</h1>
<p>Válido de ${fmt(result.monday)} a ${fmt(result.sunday)}</p>
<div id="qr"></div>
<p>Abra o SIGA no telemóvel → <strong>Ler QR da escola</strong>.</p>
<p class="small">Só vale dentro da escola (localização). Fotografias deste QR fora da escola ficam para a Direcção rever.</p>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
      popup.document.close();
      // Imagem pelo DOM (impressa como conteúdo, ao contrário de um fundo CSS).
      const qr = popup.document.createElement("img");
      qr.src = result.image;
      qr.alt = "QR de presença";
      popup.document.getElementById("qr")?.appendChild(qr);
    },
    onError: (error) =>
      toast.error("Não foi possível gerar o QR impresso", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      }),
  });
  const thisMonday = mondayOf(luandaDateOf(Date.now()));
  const span = (monday: string) => {
    const short = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
    return `${short(monday)} a ${short(addDays(monday, 6))}`;
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          disabled={disabled || print.isPending}
        >
          <Printer className="size-4" /> Imprimir QR
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => print.mutate("current")}>
          Esta semana ({span(thisMonday)})
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => print.mutate("next")}>
          Próxima semana ({span(addDays(thisMonday, 7))})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Leituras do dia ───────────────────────────────────────────────────────────

function formatDistance(meters: number) {
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString("pt-AO", { maximumFractionDigits: 1 })} km`
    : `${meters} m`;
}

const DECISION_LABEL: Record<PresenceScanRow["decision"], string> = {
  accepted: "Aceite",
  review: "Por rever",
  rejected: "Recusada",
};
const DECISION_STATUS: Record<PresenceScanRow["decision"], string> = {
  accepted: "approved",
  review: "pending",
  rejected: "rejected",
};

function PresenceScansReview() {
  const queryClient = useQueryClient();
  const scans = useQuery({
    queryKey: ["presence-scans", "today"],
    queryFn: () => listPresenceScans({ data: {} }),
    refetchInterval: 60_000,
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showAccepted, setShowAccepted] = useState(false);
  const review = useMutation({
    mutationFn: (input: { scanId: string; decision: "accepted" | "rejected"; note: string }) =>
      reviewPresenceScan({ data: input }),
    onSuccess: (result) => {
      toast.success(result.decision === "accepted" ? "Leitura confirmada" : "Leitura recusada", {
        description:
          result.decision === "accepted" && result.marked
            ? `${plural(result.marked, "aula", "aulas")} com presença registada.`
            : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ["presence-scans"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher-attendance-sessions"] });
    },
    onError: (error) =>
      toast.error("Não foi possível guardar a decisão", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      }),
  });

  const rows = scans.data?.scans ?? [];
  const pending = rows.filter((row) => row.decision === "review");
  const rejected = rows.filter((row) => row.decision === "rejected");
  const accepted = rows.filter((row) => row.decision === "accepted");
  // O que pede decisão vem primeiro; as aceites ficam recolhidas.
  const visible = [...pending, ...rejected, ...(showAccepted ? accepted : [])];

  return (
    <Panel
      title="Leituras de hoje"
      description="As leituras com dúvidas ficam aqui para a Direcção decidir."
      icon={ScanLine}
      action={
        <div className="flex items-center gap-2">
          {pending.length ? (
            <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning-strong">
              {pending.length} por rever
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Actualizar leituras"
            onClick={() => void scans.refetch()}
          >
            <RefreshCw className={`size-4 ${scans.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="Ainda sem leituras hoje"
          description="Quando os professores lerem o QR, aparecem aqui."
        />
      ) : (
        <>
          {visible.length ? (
            <ul className="divide-y">
              {visible.map((row) => {
                const flags = row.decision === "accepted" ? [] : scanNotes(row);
                return (
                  <li key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {row.teacherName}
                        {row.decision === "accepted" ? null : (
                          <StatusBadge
                            status={DECISION_STATUS[row.decision]}
                            label={DECISION_LABEL[row.decision]}
                            size="sm"
                          />
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{scanMeta(row)}</p>
                      {flags.length ? (
                        <p className="text-xs font-medium text-warning-strong">
                          {flags.join(" · ")}
                        </p>
                      ) : null}
                      {row.reviewNote ? (
                        <p className="text-xs text-muted-foreground">Decisão: {row.reviewNote}</p>
                      ) : null}
                    </div>
                    {row.decision === "review" ? (
                      <form
                        className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto"
                        onSubmit={(event) => event.preventDefault()}
                      >
                        <Input
                          aria-label="Motivo da decisão"
                          placeholder="Motivo (obrigatório)"
                          className="h-8 min-w-40 flex-1 text-xs"
                          value={notes[row.id] ?? ""}
                          onChange={(event) =>
                            setNotes((current) => ({ ...current, [row.id]: event.target.value }))
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 text-success"
                          disabled={review.isPending || (notes[row.id] ?? "").trim().length < 5}
                          onClick={() =>
                            review.mutate({
                              scanId: row.id,
                              decision: "accepted",
                              note: (notes[row.id] ?? "").trim(),
                            })
                          }
                        >
                          <CheckCircle2 className="size-3.5" /> Confirmar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 text-destructive"
                          disabled={review.isPending || (notes[row.id] ?? "").trim().length < 5}
                          onClick={() =>
                            review.mutate({
                              scanId: row.id,
                              decision: "rejected",
                              note: (notes[row.id] ?? "").trim(),
                            })
                          }
                        >
                          <XCircle className="size-3.5" /> Recusar
                        </Button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {accepted.length ? (
            <button
              type="button"
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-1 py-2.5 text-left text-sm text-muted-foreground hover:text-foreground ${visible.length ? "mt-1 border-t" : ""}`}
              aria-expanded={showAccepted}
              onClick={() => setShowAccepted((open) => !open)}
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" />
                {accepted.length === 1 ? "1 leitura aceite" : `${accepted.length} leituras aceites`}
              </span>
              <span className="text-xs font-medium">{showAccepted ? "Esconder" : "Ver"}</span>
            </button>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function scanMeta(row: PresenceScanRow) {
  return [
    luandaTimeOfMs(Date.parse(row.scannedAt)),
    row.kind === "printed" ? "QR impresso" : null,
    row.offline ? "enviada sem rede" : null,
    row.distanceM != null ? `a ${formatDistance(row.distanceM)}` : null,
    row.sessionCount ? plural(row.sessionCount, "aula", "aulas") : "sem aula a essa hora",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Motivos curtos, sem repetir o que a linha já diz. */
function scanNotes(row: PresenceScanRow) {
  const notes = row.reasons
    .filter((reason) => !(reason === "aparelho_partilhado" && row.sharedWith.length))
    .map((reason) => PRESENCE_SCAN_REASON_SHORT[reason])
    .filter((label): label is string => Boolean(label));
  if (row.sharedWith.length) notes.push(`Mesmo telemóvel que ${row.sharedWith.join(", ")}`);
  return notes;
}
