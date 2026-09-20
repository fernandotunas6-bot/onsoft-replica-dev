import { useEffect } from "react";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useAppearance } from "@/lib/appearance";
import { normalizeBrandHex } from "@/lib/brand-tokens";

/**
 * Injecta as cores de `school_branding` na aparência do dispositivo.
 * Não persiste a marca no localStorage — só `preferPersonalAccent`.
 */
export function SchoolBrandAppearanceSync() {
  const { school } = useSchoolSettings();
  const { set } = useAppearance();

  const primary = normalizeBrandHex(school?.branding?.primary_color);
  const secondary = normalizeBrandHex(school?.branding?.secondary_color);

  useEffect(() => {
    if (!primary) {
      set({ schoolBrand: null });
      return;
    }
    set({
      schoolBrand: {
        primary,
        secondary,
      },
    });
  }, [primary, secondary, set]);

  return null;
}
