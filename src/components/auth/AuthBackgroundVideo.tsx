import { useEffect, useState } from "react";
import classroomVideo from "@/assets/auth-classroom.mp4.asset.json";

/** Vídeo de fundo leve: só carrega em ecrãs grandes, sem som, respeita "reduzir movimento". */
export function AuthBackgroundVideo() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (!wide || reduce || conn?.saveData) return;
    const id = window.setTimeout(() => setEnabled(true), 600);
    return () => window.clearTimeout(id);
  }, []);
  if (!enabled) return null;
  return (
    <video
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full object-cover animate-fade-in"
      src={classroomVideo.url}
      autoPlay
      muted
      loop
      playsInline
      preload="none"
    />
  );
}
