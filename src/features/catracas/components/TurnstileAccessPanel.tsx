import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Plus,
  RefreshCw,
  Search,
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
} from "lucide-react";
import { WindowsDesktopSettingsModal } from "./WindowsDesktopSettingsModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  validateGatePassToken,
  listAccessLogs,
  exportGatePassOfflineList,
} from "@/features/catracas/server";
import { CampusAttendanceReconciliationPanel } from "@/features/catracas/components/CampusAttendanceReconciliationPanel";

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
  const [deviceType, setDeviceType] = useState<"turnstile" | "gate" | "door" | "scanner_app">(
    "turnstile",
  );

  const devicesQuery = useQuery({
    queryKey: ["turnstile-devices"],
    queryFn: () => listTurnstileDevices(),
  });

  const logsQuery = useQuery({
    queryKey: ["access-logs"],
    queryFn: () => listAccessLogs({ data: { limit: 50 } }),
  });

  const validateMutation = useMutation({
    mutationFn: (vars: NonNullable<Parameters<typeof validateGatePassToken>[0]>["data"]) =>
      validateGatePassToken({ data: vars }),
    onSuccess: (res) => {
      setLastScanResult(res);
      if (res.granted) {
        toast.success(`Entrada Autorizada: ${res.personName}`, {
          description: `Catraca libertada às ${new Date().toLocaleTimeString("pt-PT")}`,
        });
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
    },
    onError: (err) => {
      toast.error("Não foi possível registar o dispositivo", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });

  const handleSimulateScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatorToken.trim()) return;
    validateMutation.mutate({
      token: simulatorToken.trim(),
      direction: scanDirection,
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
      {/* PAINEL DE CONCILIAÇÃO: ENTRADAS NA PORTARIA VS. CHAMADA DA TURMA */}
      <CampusAttendanceReconciliationPanel />

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
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDesktopSettingsOpen(true)}
                className="h-7 text-[11px] gap-1 font-bold text-primary border-primary/30 bg-primary/10 hover:bg-primary/20"
              >
                <Monitor className="size-3.5" /> Configurações Windows
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
            <div className="flex items-center gap-2">
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
                  {lastScanResult.granted ? "CATRACA LIBERTADA (ENTRADA)" : "ACESSO RECUSADO"}
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
              {devices.map((dev) => (
                <div
                  key={dev.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-xl bg-primary-soft text-primary-strong flex items-center justify-center">
                      {dev.device_type === "scanner_app" ? (
                        <Smartphone className="size-4" />
                      ) : (
                        <DoorOpen className="size-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">{dev.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {dev.location} · {dev.direction_capability}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-secondary text-muted-foreground border-border text-[10px] gap-1"
                  >
                    <Wifi className="size-3" /> Registado
                  </Badge>
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
                    {log.status === "granted" ? (
                      <Badge
                        variant="outline"
                        className="bg-success/10 text-success border-success/30 text-[10px]"
                      >
                        Autorizado
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]"
                      >
                        Negado: {log.denial_reason}
                      </Badge>
                    )}
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
