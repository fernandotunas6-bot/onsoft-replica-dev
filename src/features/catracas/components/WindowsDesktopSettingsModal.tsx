import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Monitor,
  Cpu,
  Printer,
  Check,
  RefreshCw,
  ShieldCheck,
  Wifi,
  Usb,
  Lock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  isTauriDesktop,
  triggerTurnstileRelay,
  printThermalReceiptNative,
  discoverLocalHardwareDevices,
  getLocalHardwareAllowlist,
  saveLocalHardwareAllowlist,
  getLocalHardwareBridgeConfig,
  saveLocalHardwareBridgeConfig,
  type LocalHardwareDevice,
} from "@/lib/tauri-bridge";

const STORAGE_KEY = "siga-desktop-settings";

interface DesktopSettings {
  turnstileIp: string;
  printerIp: string;
  sigaAppUrl: string;
  deviceApiKey: string;
  autoStartWindows: boolean;
  nativeNotifications: boolean;
}

const defaultSettings: DesktopSettings = {
  turnstileIp: "192.168.1.201",
  printerIp: "192.168.1.205",
  sigaAppUrl: "http://127.0.0.1:3006",
  deviceApiKey: "",
  autoStartWindows: true,
  nativeNotifications: true,
};

function loadDesktopSettings(): DesktopSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

function saveDesktopSettings(settings: DesktopSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Armazenamento indisponível (privado/bloqueado) — as definições ficam só nesta sessão.
  }
}

export function WindowsDesktopSettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [turnstileIp, setTurnstileIp] = useState(defaultSettings.turnstileIp);
  const [printerIp, setPrinterIp] = useState(defaultSettings.printerIp);
  const [sigaAppUrl, setSigaAppUrl] = useState(defaultSettings.sigaAppUrl);
  const [deviceApiKey, setDeviceApiKey] = useState(defaultSettings.deviceApiKey);
  const [autoStartWindows, setAutoStartWindows] = useState(defaultSettings.autoStartWindows);
  const [nativeNotifications, setNativeNotifications] = useState(
    defaultSettings.nativeNotifications,
  );
  const [isTestingHardware, setIsTestingHardware] = useState(false);
  const [discovered, setDiscovered] = useState<LocalHardwareDevice[]>([]);
  const [allowedIds, setAllowedIds] = useState<Set<string>>(new Set());
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discoverMeta, setDiscoverMeta] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const stored = loadDesktopSettings();
    setTurnstileIp(stored.turnstileIp);
    setPrinterIp(stored.printerIp);
    setSigaAppUrl(stored.sigaAppUrl);
    setDeviceApiKey(stored.deviceApiKey);
    setAutoStartWindows(stored.autoStartWindows);
    setNativeNotifications(stored.nativeNotifications);
    void refreshLocalDiscovery();
    void getLocalHardwareBridgeConfig().then((cfg) => {
      if (cfg.siga_app_url) setSigaAppUrl(cfg.siga_app_url);
      if (cfg.device_api_key) setDeviceApiKey(cfg.device_api_key);
      if (cfg.turnstile_ip) setTurnstileIp(cfg.turnstile_ip);
    });
  }, [open]);

  const refreshLocalDiscovery = async () => {
    setDiscoverBusy(true);
    setDiscoverError(null);
    try {
      const [scan, allow] = await Promise.all([
        discoverLocalHardwareDevices(),
        getLocalHardwareAllowlist(),
      ]);
      if (!scan.ok) {
        setDiscoverError(scan.error || "Falha na descoberta local");
        setDiscovered([]);
      } else {
        setDiscovered(scan.devices || []);
        const counts = scan.counts;
        setDiscoverMeta(
          counts
            ? `${counts.serial_usb} USB-série · ${counts.cups_printer} CUPS · só localhost`
            : "só localhost · sem enviar para cloud",
        );
      }
      setAllowedIds(new Set((allow.devices || []).map((d) => d.id)));
      if (allow.error && scan.ok === false) {
        setDiscoverError(allow.error);
      }
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : "Erro na descoberta");
    } finally {
      setDiscoverBusy(false);
    }
  };

  const toggleAllowDevice = async (device: LocalHardwareDevice, enable: boolean) => {
    const next = new Set(allowedIds);
    if (enable) next.add(device.id);
    else next.delete(device.id);

    const devices = discovered
      .filter((d) => next.has(d.id))
      .map((d) => ({ id: d.id, kind: d.kind, path: d.path, label: d.label }));

    // Incluir ids allowlistados que já não aparecem no scan (ainda válidos)
    for (const id of next) {
      if (!devices.some((d) => d.id === id)) {
        devices.push({ id, kind: "unknown", path: "", label: id });
      }
    }

    try {
      const saved = await saveLocalHardwareAllowlist(devices);
      setAllowedIds(new Set((saved.devices || []).map((d) => d.id)));
      toast.success(enable ? "Dispositivo autorizado neste PC" : "Autorização removida", {
        description: "Allowlist só neste computador — não sobe para a cloud.",
      });
    } catch (err) {
      toast.error("Não foi possível guardar a allowlist", {
        description: err instanceof Error ? err.message : "Daemon offline?",
      });
    }
  };

  const handleTestTurnstile = async () => {
    setIsTestingHardware(true);
    try {
      const res = await triggerTurnstileRelay({
        ipAddress: turnstileIp,
        gate: 1,
        direction: "entry",
      });
      toast.success("Comando Enviado com Sucesso!", {
        description: res.message || `Pulso enviado para ${turnstileIp} via ${res.source}`,
      });
    } catch (err) {
      toast.error("Falha ao testar catraca", {
        description: err instanceof Error ? err.message : "Verifique o IP e a ligação da catraca.",
      });
    } finally {
      setIsTestingHardware(false);
    }
  };

  const handleTestPrinter = async () => {
    setIsTestingHardware(true);
    try {
      const res = await printThermalReceiptNative({
        printerIp: printerIp,
        receiptText:
          "========================================\n       TESTE SIGA DESKTOP TAURI 2       \n========================================\nImpressora Termica Conectada!",
      });
      toast.success("Recibo de Teste Enviado!", {
        description: res.message || `Dados enviados para ${printerIp}`,
      });
    } catch (err) {
      toast.error("Falha ao testar impressora", {
        description: err instanceof Error ? err.message : "Verifique a impressora de rede.",
      });
    } finally {
      setIsTestingHardware(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold">
              <Monitor className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-extrabold">
                Configurações do SIGA Desktop (Windows / macOS / Linux)
              </DialogTitle>
              <DialogDescription className="text-xs">
                Relés, impressoras, descoberta local USB/CUPS e allowlist neste PC.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* MODO DE FUNCIONAMENTO */}
          <div className="p-3 rounded-xl bg-secondary/50 border border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-5 text-primary shrink-0" />
              <div>
                <p className="font-bold text-foreground">Ambiente de Execução</p>
                <p className="text-[11px] text-muted-foreground">
                  {isTauriDesktop()
                    ? "Tauri 2 Rust Nativo (Máxima Velocidade)"
                    : "Modo Web com Daemon Python HTTP"}
                </p>
              </div>
            </div>
            <span className="font-mono text-[10px] bg-primary/10 text-primary px-2 py-1 rounded font-bold">
              {isTauriDesktop() ? "RUST NATIVE" : "WEB HTTP"}
            </span>
          </div>

          {/* CONFIGURAÇÃO DA CATRACA IP */}
          <div className="surface-card p-4 space-y-3">
            <h4 className="font-bold text-xs flex items-center gap-2">
              <Cpu className="size-4 text-primary" /> Catraca & Relé de Entrada/Saída
            </h4>
            <div className="grid gap-2 sm:grid-cols-3 items-end">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-[11px] font-semibold">
                  Endereço IP da Controladora (TCP 4370)
                </Label>
                <Input
                  value={turnstileIp}
                  onChange={(e) => setTurnstileIp(e.target.value)}
                  placeholder="Ex: 192.168.1.201"
                  className="text-xs h-9 font-mono"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isTestingHardware}
                onClick={handleTestTurnstile}
                className="h-9 gap-1.5 text-xs font-bold"
              >
                <Wifi className="size-3.5" /> Testar Relé
              </Button>
            </div>
          </div>

          {/* CONFIGURAÇÃO DA IMPRESSORA TÉRMICA */}
          <div className="surface-card p-4 space-y-3">
            <h4 className="font-bold text-xs flex items-center gap-2">
              <Printer className="size-4 text-primary" /> Impressora Térmica de Recibos (ESC/POS
              9100)
            </h4>
            <div className="grid gap-2 sm:grid-cols-3 items-end">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-[11px] font-semibold">
                  Endereço IP da Impressora de Rede
                </Label>
                <Input
                  value={printerIp}
                  onChange={(e) => setPrinterIp(e.target.value)}
                  placeholder="Ex: 192.168.1.205"
                  className="text-xs h-9 font-mono"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isTestingHardware}
                onClick={handleTestPrinter}
                className="h-9 gap-1.5 text-xs font-bold"
              >
                <Printer className="size-3.5" /> Imprimir Teste
              </Button>
            </div>
          </div>

          {/* LIGAÇÃO SIGA ↔ WEBHOOK LOCAL */}
          <div className="surface-card p-4 space-y-3">
            <h4 className="font-bold text-xs flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" /> Validação SIGA (webhook local)
            </h4>
            <p className="text-[11px] text-muted-foreground">
              O daemon em <span className="font-mono">127.0.0.1:8088</span> encaminha leituras
              RFID/QR para <span className="font-mono">POST /api/catracas/device-scan</span> usando
              a Key do dispositivo registado em Catracas.
            </p>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">URL do SIGA Plus</Label>
                <Input
                  value={sigaAppUrl}
                  onChange={(e) => setSigaAppUrl(e.target.value)}
                  placeholder="http://127.0.0.1:3006"
                  className="text-xs h-9 font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">API Key do dispositivo (Key)</Label>
                <Input
                  value={deviceApiKey}
                  onChange={(e) => setDeviceApiKey(e.target.value)}
                  placeholder="KEY-XXXXXXXX"
                  className="text-xs h-9 font-mono"
                />
              </div>
            </div>
          </div>

          {/* DESCOBERTA LOCAL LINUX / USB / CUPS */}
          <div className="surface-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-bold text-xs flex items-center gap-2">
                <Usb className="size-4 text-primary" /> Hardware local (USB-série + CUPS)
              </h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={discoverBusy}
                onClick={() => void refreshLocalDiscovery()}
                className="h-8 gap-1.5 text-[11px] font-bold shrink-0"
              >
                <RefreshCw className={`size-3.5 ${discoverBusy ? "animate-spin" : ""}`} />
                Procurar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <Lock className="size-3.5 mt-0.5 shrink-0" />
              Só lista portas série conhecidas e impressoras CUPS via daemon em{" "}
              <span className="font-mono">127.0.0.1:8088</span>. Não lê pastas pessoais nem o
              browser; a allowlist fica neste PC.
            </p>
            {discoverMeta ? (
              <p className="text-[10px] font-mono text-muted-foreground">{discoverMeta}</p>
            ) : null}
            {discoverError ? (
              <p className="text-[11px] text-destructive rounded-lg bg-destructive/10 px-2.5 py-2">
                {discoverError}
              </p>
            ) : null}
            {!discoverError && discovered.length === 0 && !discoverBusy ? (
              <p className="text-[11px] text-muted-foreground">
                Nenhum dispositivo encontrado. Ligue um leitor USB ou configure uma impressora CUPS
                e volte a procurar.
              </p>
            ) : null}
            <ul className="space-y-2 max-h-40 overflow-y-auto">
              {discovered.map((device) => {
                const allowed = allowedIds.has(device.id);
                return (
                  <li
                    key={device.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{device.label || device.path}</p>
                      <p className="font-mono text-[10px] text-muted-foreground truncate">
                        {device.kind} · {device.path || device.id}
                      </p>
                    </div>
                    <Switch
                      checked={allowed}
                      onCheckedChange={(on) => void toggleAllowDevice(device, on)}
                      aria-label={allowed ? "Remover da allowlist" : "Autorizar neste PC"}
                    />
                  </li>
                );
              })}
            </ul>
          </div>

          {/* OPÇÕES DO SISTEMA OPERATIVO */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">Notificações Nativas do Windows</p>
                <p className="text-[11px] text-muted-foreground">
                  Alertas de catraca no Centro de Ações do SO
                </p>
              </div>
              <Switch checked={nativeNotifications} onCheckedChange={setNativeNotifications} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">Iniciar com o Windows</p>
                <p className="text-[11px] text-muted-foreground">
                  Abrir o SIGA Desktop automaticamente ao ligar o PC
                </p>
              </div>
              <Switch checked={autoStartWindows} onCheckedChange={setAutoStartWindows} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => {
              saveDesktopSettings({
                turnstileIp,
                printerIp,
                sigaAppUrl,
                deviceApiKey,
                autoStartWindows,
                nativeNotifications,
              });
              void saveLocalHardwareBridgeConfig({
                siga_app_url: sigaAppUrl,
                device_api_key: deviceApiKey,
                turnstile_ip: turnstileIp,
              }).catch((err) => {
                toast.error("Definições locais do daemon não guardadas", {
                  description: err instanceof Error ? err.message : "Daemon offline?",
                });
              });
              toast.success("Configurações do SIGA Desktop guardadas com sucesso!");
              onOpenChange(false);
            }}
            className="gap-2 font-bold"
          >
            <Check className="size-4" /> Guardar Configurações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
