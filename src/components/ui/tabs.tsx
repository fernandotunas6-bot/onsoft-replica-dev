import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";
import { revealVerticalTab } from "@/lib/tab-navigation";

const TabsLayoutContext = React.createContext<"inline" | "sidebar">("inline");

/** Page sections use a left rail; compact controls keep the inline layout. */
const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & {
    layout?: "inline" | "sidebar";
  }
>(({ layout = "inline", orientation, className, ...props }, ref) => (
  <TabsLayoutContext.Provider value={layout}>
    <TabsPrimitive.Root
      {...props}
      ref={ref}
      orientation={layout === "sidebar" ? "vertical" : orientation}
      data-layout={layout}
      className={cn(
        className,
        layout === "sidebar" && "flex min-w-0 flex-col gap-5 space-y-0 lg:flex-row lg:items-start",
      )}
    />
  </TabsLayoutContext.Provider>
));
Tabs.displayName = "Tabs";

/** Contains tools and panels to the right of the page section navigation. */
function TabsPanels({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("min-w-0 flex-1 [&>[role=tabpanel]:first-child]:mt-0", className)}
      {...props}
    />
  );
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const layout = React.useContext(TabsLayoutContext);
  const listRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => listRef.current!);
  React.useEffect(() => {
    const list = listRef.current;
    if (!list || list.getAttribute("aria-orientation") !== "vertical") return;
    const revealActive = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (active) revealVerticalTab(active);
    };
    revealActive();
    const observer = new MutationObserver(revealActive);
    observer.observe(list, {
      attributes: true,
      attributeFilter: ["data-state"],
      childList: true,
      subtree: true,
    });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(revealActive);
    resize?.observe(list);
    return () => {
      observer.disconnect();
      resize?.disconnect();
    };
  }, [layout]);
  return (
    <TabsPrimitive.List
      ref={listRef}
      className={cn(
        "inline-flex min-h-9 min-w-0 max-w-full items-center justify-start overflow-x-auto overscroll-x-contain rounded-lg bg-muted/70 p-1 text-muted-foreground [scrollbar-width:thin]",
        className,
        layout === "sidebar" &&
          "flex h-auto max-h-64 w-full flex-none flex-col flex-nowrap items-stretch justify-start gap-1 overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-lg border border-border/70 bg-muted/30 p-1.5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:w-52",
      )}
      {...props}
    />
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, onFocus, ...props }, ref) => {
  const layout = React.useContext(TabsLayoutContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      onFocus={(event) => {
        onFocus?.(event);
        // O foco nativo pode deixar um separador apenas parcialmente visível.
        // Revelar o destino por inteiro, sem animar nem recentrar a página.
        if (!event.defaultPrevented) {
          if (
            event.currentTarget.closest('[role="tablist"]')?.getAttribute("aria-orientation") ===
            "vertical"
          )
            revealVerticalTab(event.currentTarget);
          else
            event.currentTarget.scrollIntoView?.({
              block: "nearest",
              inline: "nearest",
              behavior: "instant",
            });
        }
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs md:text-sm font-medium cursor-pointer transition-[color,background-color,box-shadow] duration-(--siga-motion-fast) ease-(--siga-ease) hover:text-foreground motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs",
        className,
        layout === "sidebar" &&
          "min-h-10 w-full justify-start whitespace-normal [overflow-wrap:anywhere] border-b-0 border-l-2 border-transparent px-3 py-2 text-left leading-snug shadow-none [&>svg]:shrink-0 hover:bg-secondary/70 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:font-semibold data-[state=active]:text-[var(--primary-strong)] data-[state=active]:shadow-none",
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsPanels };
