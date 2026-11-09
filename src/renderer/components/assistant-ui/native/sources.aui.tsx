"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useState,
  type ComponentProps,
} from "react";
import { FileTextIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import type { SourceMessagePartComponent } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { hostOf, safeHref } from "../utils/href";

const sourceVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors motion-reduce:transition-none [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        outline:
          "border-input text-muted-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground border bg-transparent",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80",
        muted:
          "bg-muted text-muted-foreground [a&]:hover:bg-muted/80 [a&]:hover:text-foreground",
        ghost:
          "text-muted-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground bg-transparent",
        info: "bg-accent text-accent-foreground [a&]:hover:bg-accent/80",
        warning:
          "bg-chart-4/10 text-chart-4 [a&]:hover:bg-chart-4/20",
        success:
          "bg-chart-2/10 text-chart-2 [a&]:hover:bg-chart-2/20",
        destructive:
          "bg-destructive/10 text-destructive [a&]:hover:bg-destructive/20",
      },
      size: {
        sm: "px-1.5 py-0.5",
        default: "px-2 py-1",
        lg: "px-2.5 py-1.5 text-sm",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  },
);

const defaultFaviconUrl = (domain: string) =>
  `https://icons.duckduckgo.com/ip3/${domain}.ico`;

const SourceIcon = forwardRef<
  HTMLSpanElement,
  ComponentProps<"span"> & {
    url: string;
    faviconUrl?: ((domain: string) => string) | undefined;
  }
>(function SourceIcon(
  { url, className, faviconUrl = defaultFaviconUrl, ...props },
  ref,
) {
  const domain = hostOf(url);
  const src = domain === undefined ? undefined : faviconUrl(domain);
  const [errorSrc, setErrorSrc] = useState<string | undefined>(undefined);
  const hasError = src === undefined || errorSrc === src;
  const imageRef = useCallback(
    (el: HTMLImageElement | null) => {
      // A server-rendered image that fails before hydration never fires onError.
      if (el?.complete && el.naturalWidth === 0) setErrorSrc(src);
      if (typeof ref === "function") return ref(el);
      if (ref) ref.current = el;
    },
    [ref, src],
  );

  if (hasError) {
    return (
      <span
        ref={ref}
        data-slot="source-icon-fallback"
        className={cn(
          "bg-muted flex size-3 shrink-0 items-center justify-center rounded-sm text-[10px] font-medium",
          className,
        )}
        {...props}
      >
        {domain?.charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <img
      data-slot="source-icon"
      src={src}
      alt=""
      className={cn("size-3 shrink-0 rounded-sm", className)}
      onError={() => setErrorSrc(src)}
      {...(props as ComponentProps<"img">)}
      ref={imageRef}
    />
  );
});

function SourceTitle({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="source-title"
      className={cn("max-w-37.5 truncate", className)}
      {...props}
    />
  );
}

function DocumentSourceIcon({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="source-document-icon"
      className={cn(
        "text-muted-foreground flex size-3 shrink-0 items-center justify-center",
        className,
      )}
      {...props}
    >
      <FileTextIcon className="size-3" />
    </span>
  );
}

export type SourceProps = ComponentProps<"a"> &
  VariantProps<typeof sourceVariants>;

function Source({
  className,
  variant,
  size,
  target = "_blank",
  rel = "noopener noreferrer",
  ...props
}: SourceProps) {
  return (
    <a
      data-slot="source"
      className={cn(
        sourceVariants({ variant, size }),
        "focus-visible:border-ring focus-visible:ring-ring/50 cursor-pointer outline-none focus-visible:ring-1",
        className,
      )}
      target={target}
      rel={rel}
      {...props}
    />
  );
}

const SourcesImpl: SourceMessagePartComponent = (part) => {
  if (part.sourceType === "url" && part.url) {
    const href = safeHref(part.url);
    const domain = hostOf(part.url);
    const displayTitle = part.title || domain || part.url;
    const content = (
      <>
        <SourceIcon url={part.url} />
        <SourceTitle>{displayTitle}</SourceTitle>
      </>
    );

    return href ? (
      <Source href={href}>{content}</Source>
    ) : (
      <span
        data-slot="source"
        className={cn(sourceVariants(), "cursor-default")}
      >
        {content}
      </span>
    );
  }

  if (part.sourceType === "document") {
    return (
      <Badge
        variant="secondary"
        className="focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-1"
      >
        <span data-slot="source" className="inline-flex items-center gap-1.5">
          <DocumentSourceIcon />
          <SourceTitle>{part.title}</SourceTitle>
        </span>
      </Badge>
    );
  }

  return null;
};

const Sources = memo(SourcesImpl) as unknown as SourceMessagePartComponent & {
  Root: typeof Source;
  Icon: typeof SourceIcon;
  Title: typeof SourceTitle;
};

Sources.displayName = "Sources";
Sources.Root = Source;
Sources.Icon = SourceIcon;
Sources.Title = SourceTitle;

export { Sources, Source, SourceIcon, SourceTitle, sourceVariants };
