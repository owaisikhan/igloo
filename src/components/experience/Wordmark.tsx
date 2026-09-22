import { brand } from "@/content/site";
import { cn } from "@/lib/utils";

/** Outlined, glowing KODEXA wordmark. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "outline-word select-none font-semibold uppercase tracking-[0.08em] leading-none",
        className,
      )}
    >
      {brand.wordmark}
    </span>
  );
}
