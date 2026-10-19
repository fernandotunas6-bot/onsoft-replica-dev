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
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
