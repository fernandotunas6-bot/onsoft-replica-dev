import * as React from "react";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Puxar para actualizar (§57).
 *
 * Implementado com eventos de toque passivos e um limiar de 64px. Duas
 * condições impedem que roube o scroll normal:
 *
 * 1. Só arranca com o contentor no topo (`scrollTop <= 0`).
 * 2. Só reage a movimento predominantemente vertical — arrastar na diagonal
 *    dentro de uma lista horizontal (os separadores, os chips) não dispara.
 *
 * Não substitui o botão de actualizar: é um atalho, e um gesto nunca pode ser a
 * única forma de fazer algo (§56).
 */
const THRESHOLD = 64;

export function PullToRefresh({
  onRefresh,
  children,
  disabled = false,
}: {
  onRefresh: () => Promise<unknown> | void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const start = React.useRef<{ x: number; y: number } | null>(null);
  const active = React.useRef(false);

  const onTouchStart = (event: React.TouchEvent) => {
    if (disabled || refreshing) return;
    const scroller = document.scrollingElement ?? document.documentElement;
    if (scroller.scrollTop > 0) return;
    const touch = event.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY };
    active.current = false;
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (!start.current || refreshing) return;
    const touch = event.touches[0];
    const dy = touch.clientY - start.current.y;
    const dx = touch.clientX - start.current.x;
    if (dy <= 0) return;
    if (!active.current) {
      if (Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        start.current = null;
        return;
      }
      active.current = true;
    }
    // Resistência: 0.5 faz o gesto parecer elástico em vez de seguir o dedo.
    setPull(Math.min(dy * 0.5, THRESHOLD * 1.5));
  };

  const onTouchEnd = async () => {
    const shouldRefresh = active.current && pull >= THRESHOLD;
    start.current = null;
    active.current = false;
    if (!shouldRefresh) {
      setPull(0);
      return;
    }
    setRefreshing(true);
    setPull(THRESHOLD * 0.6);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => void onTouchEnd()}
      onTouchCancel={() => {
        start.current = null;
        active.current = false;
        setPull(0);
      }}
    >
      <div
        aria-hidden={!refreshing}
        className="flex items-center justify-center overflow-hidden text-muted-foreground transition-[height] duration-150"
        style={{ height: pull }}
      >
        {pull > 8 ? (
          <RefreshCw
            className={cn("size-4", refreshing ? "animate-spin" : "")}
            style={{ opacity: Math.min(pull / THRESHOLD, 1) }}
          />
        ) : null}
      </div>
      {children}
    </div>
  );
}
