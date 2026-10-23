import { cn } from "@/lib/utils";

// Every screen's title row: a noun h1, one line about the data (the finding or the
// scope, never instructions), and the screen's real actions on the right. `hero` turns
// it into the navy beacon band used on the home screens.
export function PageHeader({
  title,
  description,
  actions,
  hero = false,
  greeting,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  hero?: boolean;
  /** Hero only: a line above the title ("Good evening, Danielle"). */
  greeting?: string;
  children?: React.ReactNode;
}) {
  if (hero) {
    return (
      <div className="relative overflow-hidden rounded-3xl px-6 py-7 beacon-band shadow-[0_1px_3px_rgb(18_49_83/0.08)] sm:px-8 sm:py-8">
        <span aria-hidden="true" className="beacon-beam" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {greeting && <p className="mb-1 text-[15px] font-medium text-white/80">{greeting}</p>}
            <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight text-white sm:text-[34px]">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-3xl text-[15px] text-white/85">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
        {children && <div className="relative mt-6">{children}</div>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-tight text-brand-900 sm:text-[30px]">
          {title}
        </h1>
        <span
          aria-hidden="true"
          className={cn(
            "mt-2 block h-1 w-12 rounded-full bg-gradient-to-r from-brand-600 to-beacon-light"
          )}
        />
        {description && (
          <p className="mt-2.5 max-w-3xl text-[15px] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
