import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

/** Small entry point: no editor library or template is imported by SettingsCenter. */
export function WebsiteStudioEntry() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/website/editor" });
  }, [navigate]);
  return (
    <p role="status">
      A abrir Website Studio… <Link to="/website/editor">Abrir editor</Link>
    </p>
  );
}
