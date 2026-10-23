import { Toaster as Sonner } from "sonner";
import { FeedbackIcon } from "@/components/ui/feedback-icon";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ icons, ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <FeedbackIcon state="success" />,
        error: <FeedbackIcon state="error" />,
        warning: <FeedbackIcon state="warning" />,
        info: <FeedbackIcon state="info" />,
        loading: <FeedbackIcon state="processing" />,
        ...icons,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          // A correcção vem na descrição: tem de ler-se bem, não ficar em cinzento-claro.
          description: "group-[.toast]:text-foreground/80 group-[.toast]:leading-snug",
          // No telemóvel o botão «ir corrigir» precisa de alvo de toque confortável.
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground max-sm:group-[.toast]:!h-10 max-sm:group-[.toast]:!px-3 group-[.toast]:shrink-0",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "max-sm:group-[.toast]:!size-7",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
