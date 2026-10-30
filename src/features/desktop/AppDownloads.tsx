import { useEffect, useState } from "react";
import { AndroidDownloadCard } from "@/features/desktop/AndroidDownloadCard";
import { DesktopDownloadPanel } from "@/features/desktop/DesktopDownloadPanel";
import { isAndroidVisitor } from "@/lib/android-app-downloads";

/**
 * As apps do SIGA para transferir: a do aparelho de quem visita primeiro
 * (Android no telemóvel, computador nos outros casos).
 */
export function AppDownloads() {
  const [android, setAndroid] = useState(false);
  useEffect(() => setAndroid(isAndroidVisitor(navigator.userAgent)), []);
  const sections = [
    <DesktopDownloadPanel key="desktop" />,
    <AndroidDownloadCard key="android" prominent={android} />,
  ];
  if (android) sections.reverse();
  return (
    <div className="space-y-8">
      {sections[0]}
      <hr className="border-border" />
      {sections[1]}
    </div>
  );
}
