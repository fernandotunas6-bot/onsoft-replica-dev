import { useEffect, useRef } from "react";
import { useSchoolSettings } from "@/features/auth/use-school-settings";

/**
 * Ecrãs com filtro de trimestre próprio seguem o período escolhido no cabeçalho.
 * Só reage a mudanças (não no arranque), para não estreitar a vista por omissão.
 */
export function useFollowSelectedTerm(onTermChange: (sequence: number) => void) {
  const { selectedTerm } = useSchoolSettings();
  const previous = useRef<string | null | undefined>(undefined);
  const callback = useRef(onTermChange);
  callback.current = onTermChange;
  useEffect(() => {
    const id = selectedTerm?.id ?? null;
    if (previous.current !== undefined && previous.current !== id && selectedTerm?.sequence) {
      callback.current(selectedTerm.sequence);
    }
    previous.current = id;
  }, [selectedTerm?.id, selectedTerm?.sequence]);
}
