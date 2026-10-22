// Every screen's title row: a noun h1, one grey line about the data (the finding or
// the scope, never instructions), and the screen's real actions on the right.
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-bold tracking-tight text-foreground sm:text-[30px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-[15px] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
