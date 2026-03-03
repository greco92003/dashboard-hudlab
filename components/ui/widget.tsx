import * as React from "react";
import { cn } from "@/lib/utils";

function Widget({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="widget"
      className={cn(
        "bg-card text-card-foreground flex flex-col rounded-xl border shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function WidgetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="widget-header"
      className={cn(
        "flex items-center justify-between px-5 pt-5 pb-3",
        className
      )}
      {...props}
    />
  );
}

function WidgetContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="widget-content"
      className={cn("flex flex-1 px-5", className)}
      {...props}
    />
  );
}

function WidgetTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="widget-title"
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function WidgetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="widget-footer"
      className={cn("flex flex-col px-5 pb-5 pt-3", className)}
      {...props}
    />
  );
}

export { Widget, WidgetHeader, WidgetContent, WidgetTitle, WidgetFooter };

