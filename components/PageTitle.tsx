/* "Manage and track your links" over a big "Campaigns" - the reference's
   page header. */
export default function PageTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pt-2 pb-5">
      <div>
        {eyebrow && <div className="text-[14px] muted mb-0.5">{eyebrow}</div>}
        <h1 className="text-[30px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>{title}</h1>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
