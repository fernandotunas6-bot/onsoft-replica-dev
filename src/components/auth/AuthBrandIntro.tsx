import { SigaWordmark } from "@/components/ui/siga-logo";

/** Marca nativa: uma entrada breve, sem vídeo, som ou atraso na autenticação. */
export function AuthBrandIntro({ className = "" }: { className?: string }) {
  return (
    <div className={`siga-brand-reveal ${className}`}>
      <SigaWordmark />
    </div>
  );
}
