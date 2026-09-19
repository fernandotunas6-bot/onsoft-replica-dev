import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Cpu,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  QrCode,
  Activity,
  DoorOpen,
  Wifi,
  Smartphone,
  Send,
  Download,
  Monitor,
  Zap,
  Copy,
} from "lucide-react";
import { WindowsDesktopSettingsModal } from "./WindowsDesktopSettingsModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  listTurnstileDevices,
  registerTurnstileDevice,
  updateTurnstileDevice,
  validateGatePassToken,
  listAccessLogs,
  exportGatePassOfflineList,
} from "@/features/catracas/server";
import type { z } from "zod";
import { CampusAttendanceReconciliationPanel } from "@/features/catracas/components/CampusAttendanceReconciliationPanel";
import { AccessCardsPanel } from "@/features/catracas/components/AccessCardsPanel";
import { validateGatePassTokenInputSchema } from "@/features/catracas/schemas";
import {
  loadDesktopHardwarePrefs,
  resolveTurnstilePulseIp,
} from "@/features/catracas/hardware-pulse";
import { checkPythonHardwareBridgeHealth, triggerTurnstileRelay } from "@/lib/tauri-bridge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SchemaMissingBanner, isSchemaMissingError } from "@/components/ui/schema-missing-banner";

type TurnstileDeviceRow = {
  id: string;
  name: string;
  location: string;
  device_type: string;
  direction_capability: string;
  ip_address?: string | null;
  status?: string | null;
  api_key?: string | null;
};

export function TurnstileAccessPanel() {
  const queryClient = useQueryClient();
  const [simulatorToken, setSimulatorToken] = useState("");
  const [scanDirection, setScanDirection] = useState<"entry" | "exit">("entry");
  const [desktopSettingsOpen, setDesktopSettingsOpen] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{
    granted: boolean;
    personName?: string;
    photoUrl?: string | null;
    reason?: string;
  } | null>(null);

  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [deviceLocation, setDeviceLocation] = useState("");
  const [deviceIp, setDeviceIp] = useState("");
  const [deviceType, setDeviceType] = useState<"turnstile" | "gate" | "door" | "scanner_app">(
    "turnstile",
  );
  const [pulsingDeviceId, setPulsingDeviceId] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [logStatusFilter, setLogStatusFilter] = useState<"all" | "granted" | "denied">("all");

  const devicesQuery = useQuery({
    queryKey: ["turnstile-devices"],
    queryFn: () => listTurnstileDevices(),
  });

  const logsQuery = useQuery({
    queryKey: ["access-logs", logStatusFilter],
    queryFn: () =>
      listAccessLogs({
        data: {
          limit: 50,
          ...(logStatusFilter !== "all" ? { status: logStatusFilter } : {}),
        },
      }),
  });

  const bridgeHealthQuery = useQuery({
    queryKey: ["hardware-bridge-health"],
    queryFn: () => checkPythonHardwareBridgeHealth(),
    refetchInterval: 15_000,
    retry: false,
  });

  const pulsePhysicalRelay = async (
    direction: "entry" | "exit",
    preferredDeviceId?: string | null,
  ) => {
    const devices = (devicesQuery.data ?? []) as TurnstileDeviceRow[];
    const target = resolveTurnstilePulseIp({
      devices,
      preferredDeviceId,
      desktopPrefs: loadDesktopHardwarePrefs(),
    });
    try {
      const res = await triggerTurnstileRelay({
        ipAddress: target.ipAddress,
        gate: 1,
        direction,
      });
      toast.message("Relé físico enviado", {
        description: `${direction === "entry" ? "Entrada" : "Saída"} → ${target.ipAddress} (${target.source} · ${res.source})`,
      });
    } catch (err) {
      toast.warning("Acesso autorizado, mas o relé local falhou", {
        description:
          err instanceof Error
            ? err.message
            : "Arranque o daemon Python em 127.0.0.1:8088 ou use Configurações desktop.",
      });
    }
  };

  const validateMutation = useMutation({
    mutationFn: (vars: z.infer<typeof validateGatePassTokenInputSchema>) =>
      validateGatePassToken({ data: vars }),
    onSuccess: (res, vars) => {
      setLastScanResult(res);
      if (res.granted) {
        const dirLabel = (vars.direction ?? "entry") === "entry" ? "Entrada" : "Saída";
        toast.success(`${dirLabel} autorizada: ${res.personName}`, {
          description: `Catraca libertada às ${new Date().toLocaleTimeString("pt-PT")}`,
        });
        void pulsePhysicalRelay(vars.direction ?? "entry", vars.deviceId);
      } else {
        toast.error("Acesso Negado na Catraca", {
          description: res.reason,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["access-logs"] });
      setSimulatorToken("");
    },
    onError: (err) => {
      toast.error("Erro ao validar acesso", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });

  const registerDeviceMutation = useMutation({
    mutationFn: (vars: NonNullable<Parameters<typeof registerTurnstileDevice>[0]>["data"]) =>
      registerTurnstileDevice({ data: vars }),
    onSuccess: () => {
      toast.success("Dispositivo de catraca registado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["turnstile-devices"] });
      setRegisterModalOpen(false);
      setDeviceName("");
      setDeviceLocation("");
      setDeviceIp("");
    },
    onError: (err) => {
      toast.error("Não foi possível registar o dispositivo", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });

  const deviceStatusMutation = useMutation({
    mutationFn: (vars: { deviceId: string; status: "online" | "offline" | "maintenance" }) =>
      updateTurnstileDevice({ data: vars }),
    onSuccess: (dev) => {
      toast.success(`Dispositivo «${dev.name}» → ${dev.status}`);
      queryClient.invalidateQueries({ queryKey: ["turnstile-devices"] });
    },
    onError: (err) => {
      toast.error("Não foi possível actualizar o estado", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });

  const handleManualPulse = async (device: TurnstileDeviceRow) => {
    setPulsingDeviceId(device.id);
    try {
      await pulsePhysicalRelay(scanDirection, device.id);
    } finally {
      setPulsingDeviceId(null);
    }
  };

  const copyDeviceApiKey = async (device: TurnstileDeviceRow) => {
    if (!device.api_key) {
      toast.error("Este dispositivo não tem API key.");
      return;
    }
    try {
      await navigator.clipboard.writeText(device.api_key);
      toast.success("API key copiada", {
        description: "Use nos controladores offline — não partilhe fora da escola.",
      });
    } catch {
      toast.message(device.api_key);
    }
  };

  const handleSimulateScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatorToken.trim()) return;
    validateMutation.mutate({
      token: simulatorToken.trim(),
      direction: scanDirection,
      ...(selectedDeviceId ? { deviceId: selectedDeviceId } : {}),
    });
  };

  const handleExportOffline = async () => {
    try {
      const res = await exportGatePassOfflineList();
      const jsonStr = JSON.stringify(res, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `catracas-siga-offline-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportados ${res.totalCards} cartões ativos para controladores offline.`);
    } catch (err) {
      toast.error("Erro ao exportar lista offline", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  };

  const devices = devicesQuery.data ?? [];
  const logs = logsQuery.data ?? [];

  return (
    <div className="space-y-6">
      {isSchemaMissingError(devicesQuery.error) || isSchemaMissingError(logsQuery.error) ? (
        <SchemaMissingBanner
          title="Catracas: tabelas SGA em falta"
          description="siga_access_cards, siga_turnstile_devices e siga_access_logs. Aplique APPLY_MISSING_FROM_VERIFY.sql."
        />
      ) : null}

      {/* PAINEL DE CONCILIAÇÃO: ENTRADAS NA PORTARIA VS. CHAMADA DA TURMA */}
      <CampusAttendanceReconciliationPanel />

      <AccessCardsPanel />

      {/* SIMULADOR DE LEITURA NA CATRACA & STATUS DE HARDWARE */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* TESTE E SIMULADOR DE SCANNER DE CATRACA */}
        <div className="surface-card p-5 space-y-4 border-2 border-primary/30">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <QrCode className="size-5 text-primary" /> Simulador de Leitura de Catraca /
                Portaria
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Simule a leitura de um Cartão Virtual (QR Code, Código de Barras ou Número do
                Cartão).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <Badge
                variant="outline"
                className={`text-[10px] gap-1 ${
                  bridgeHealthQuery.data?.online
                    ? "bg-success/10 text-success border-success/30"
                    : "bg-muted text-muted-foreground border-border"
                }`}
                title={
                  bridgeHealthQuery.data?.online
                    ? `Daemon local ${bridgeHealthQuery.data.bind ?? "127.0.0.1:8088"}`
                    : "Arranque: python3 python/hardware_bridge/siga_hardware_bridge.py"
                }
              >
                <Wifi className="size-3" />
                {bridgeHealthQuery.isLoading
                  ? "Bridge…"
                  : bridgeHealthQuery.data?.online
                    ? "Bridge online"
                    : "Bridge offline"}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDesktopSettingsOpen(true)}
                className="h-7 text-[11px] gap-1 font-bold text-primary border-primary/30 bg-primary/10 hover:bg-primary/20"
              >
                <Monitor className="size-3.5" /> Hardware local
              </Button>
              <Badge
                variant="outline"
                className="bg-primary/10 text-primary border-primary/30 text-[10px]"
              >
                {devices.length} dispositivo{devices.length === 1 ? "" : "s"} registado
                {devices.length === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>

          <form onSubmit={handleSimulateScan} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Direção do Braço:</span>
              <Button
                type="button"
                variant={scanDirection === "entry" ? "default" : "outline"}
                size="sm"
                onClick={() => setScanDirection("entry")}
                className="text-xs h-7 px-3 font-bold gap-1"
              >
                ➔ ENTRADA (Relé 1)
              </Button>
              <Button
                type="button"
                variant={scanDirection === "exit" ? "default" : "outline"}
                size="sm"
                onClick={() => setScanDirection("exit")}
                className="text-xs h-7 px-3 font-bold gap-1"
              >
                ⬅ SAÍDA (Relé 2)
              </Button>
            </div>

            {devices.length > 0 ? (
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Dispositivo (opcional)</Label>
                <Select
                  value={selectedDeviceId || "none"}
                  onValueChange={(v) => setSelectedDeviceId(v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Portaria genérica" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Portaria genérica (sem dispositivo)</SelectItem>
                    {(devices as TurnstileDeviceRow[]).map((dev) => (
                      <SelectItem key={dev.id} value={dev.id}>
                        {dev.name}
                        {dev.status && dev.status !== "online" ? ` · ${dev.status}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Input
                placeholder="Digitalize ou digite o número do cartão (ex: STU2026884920 ou CARD-2026-10294)..."
                value={simulatorToken}
                onChange={(e) => setSimulatorToken(e.target.value)}
                className="text-xs h-10 font-mono"
              />
              <Button
                type="submit"
                disabled={validateMutation.isPending || !simulatorToken.trim()}
                className="gap-2 font-bold h-10 px-5"
              >
                <Send className="size-4" /> Simular{" "}
                {scanDirection === "entry" ? "Entrada" : "Saída"}
              </Button>
            </div>
          </form>

          {/* PAINEL DE FEEDBACK VISUAL INSTANTÂNEO DA CATRACA */}
          {lastScanResult ? (
            <div
              className={`p-4 rounded-xl border flex items-center gap-4 transition-all ${
                lastScanResult.granted
                  ? "border-success/40 bg-success/10 text-success-strong"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              {lastScanResult.granted ? (
                <CheckCircle2 className="size-10 text-success shrink-0" />
              ) : (
                <XCircle className="size-10 text-destructive shrink-0" />
              )}
              <div>
                <h4 className="font-extrabold text-lg">
                  {lastScanResult.granted
                    ? `CATRACA LIBERTADA (${scanDirection === "entry" ? "ENTRADA" : "SAÍDA"})`
                    : "ACESSO RECUSADO"}
                </h4>
                <p className="text-xs font-semibold mt-0.5">
                  {lastScanResult.granted
                    ? `Bem-vindo(a), ${lastScanResult.personName}`
                    : lastScanResult.reason}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* LISTA DE HARDWARE E CATRACAS REGISTADAS */}
        <div className="surface-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between border-b border-border pb-3 gap-2">
            <div>
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <Cpu className="size-5 text-primary" /> Dispositivos & Catracas Ligadas
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Controlo de equipamentos físicos (Wiegand / TCP/IP / HTTP).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportOffline}
                className="gap-1.5 text-xs"
              >
                <Download className="size-3.5" /> Sync Offline (JSON)
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setRegisterModalOpen(true)}
                className="gap-1.5 text-xs font-bold"
              >
                <Plus className="size-3.5" /> Adicionar Catraca
              </Button>
            </div>
          </div>

          {devicesQuery.isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
              A carregar dispositivos de acesso...
            </div>
          ) : devices.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
              Nenhuma catraca física ou leitor registado. Registe a primeira portaria.
            </div>
          ) : (
            <div className="space-y-2">
              {(devices as TurnstileDeviceRow[]).map((dev) => (
                <div
                  key={dev.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-xl border border-border bg-card"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-xl bg-primary-soft text-primary-strong flex items-center justify-center shrink-0">
                      {dev.device_type === "scanner_app" ? (
                        <Smartphone className="size-4" />
                      ) : (
                        <DoorOpen className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{dev.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {dev.location} · {dev.direction_capability}
                        {dev.ip_address ? (
                          <span className="font-mono"> · {dev.ip_address}</span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Select
                      value={dev.status || "online"}
                      onValueChange={(status) =>
                        deviceStatusMutation.mutate({
                          deviceId: dev.id,
                          status: status as "online" | "offline" | "maintenance",
                        })
                      }
                    >
                      <SelectTrigger className="h-7 w-[110px] text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="offline">Offline</SelectItem>
                        <SelectItem value="maintenance">Manutenção</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pulsingDeviceId === dev.id}
                      onClick={() => void handleManualPulse(dev)}
                      className="h-7 text-[10px] gap-1 font-bold"
                      title="Enviar pulso de relé via daemon/Tauri"
                    >
                      <Zap className="size-3" /> Relé
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!dev.api_key}
                      onClick={() => void copyDeviceApiKey(dev)}
                      className="h-7 text-[10px] gap-1"
                      title="Copiar API key do controlador offline"
                    >
                      <Copy className="size-3" /> Key
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* STREAM EM TEMPO REAL DOS REGISTOS DE ACESSO AO RECINTO */}
      <div className="surface-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="font-extrabold text-base flex items-center gap-2">
              <Activity className="size-5 text-primary" /> Registos de Entrada e Saída no Recinto
              (Logs)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Auditoria em tempo real de entradas e saídas validadas na portaria.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["access-logs"] })}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className="size-3.5" /> Atualizar Logs
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">Filtrar:</span>
          {(
            [
              ["all", "Todos"],
              ["granted", "Autorizados"],
              ["denied", "Negados"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={logStatusFilter === value ? "default" : "outline"}
              onClick={() => setLogStatusFilter(value)}
              className="h-7 text-[11px]"
            >
              {label}
            </Button>
          ))}
        </div>

        {logsQuery.isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
            A carregar histórico de acessos...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            Ainda não foram registados eventos de passagem nas catracas.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Data & Hora</TableHead>
                <TableHead className="text-xs">Pessoa / Aluno</TableHead>
                <TableHead className="text-xs">Direção</TableHead>
                <TableHead className="text-xs">Portaria / Dispositivo</TableHead>
                <TableHead className="text-xs text-right">Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs font-mono">
                    {new Date(log.timestamp).toLocaleString("pt-PT")}
                  </TableCell>
                  <TableCell className="text-xs font-bold text-foreground">
                    {log.person_name}
                  </TableCell>
                  <TableCell className="text-xs font-semibold capitalize">
                    {log.direction === "entry" ? "Entrada" : "Saída"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{log.device_name}</TableCell>
                  <TableCell className="text-xs text-right">
                    <StatusBadge
                      status={log.status === "granted" ? "active" : "cancelled"}
                      label={log.status === "granted" ? "Autorizado" : `Negado: ${log.denial_reason}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* MODAL DE REGISTO DE NOVA CATRACA */}
      <Dialog open={registerModalOpen} onOpenChange={setRegisterModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Cpu className="size-5 text-primary" /> Registar Novo Dispositivo / Catraca
            </DialogTitle>
            <DialogDescription className="text-xs">
              Ligue um leitor de catraca física, portaria ou dispositivo móvel ao SIGA.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome do Dispositivo</Label>
              <Input
                placeholder="Ex: Catraca 01 - Entrada Principal"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Localização no Recinto</Label>
              <Input
                placeholder="Ex: Portaria Norte / Bloco B"
                value={deviceLocation}
                onChange={(e) => setDeviceLocation(e.target.value)}
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                IP da controladora (opcional, TCP 4370)
              </Label>
              <Input
                placeholder="Ex: 192.168.1.201 — usado no pulso físico ao autorizar"
                value={deviceIp}
                onChange={(e) => setDeviceIp(e.target.value)}
                className="text-xs h-9 font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRegisterModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                registerDeviceMutation.isPending || !deviceName.trim() || !deviceLocation.trim()
              }
              onClick={() =>
                registerDeviceMutation.mutate({
                  name: deviceName,
                  location: deviceLocation,
                  deviceType,
                  ...(deviceIp.trim() ? { ipAddress: deviceIp.trim() } : {}),
                })
              }
              className="gap-2 font-bold"
            >
              Registar Catraca
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WindowsDesktopSettingsModal
        open={desktopSettingsOpen}
        onOpenChange={setDesktopSettingsOpen}
      />
    </div>
  );
}
