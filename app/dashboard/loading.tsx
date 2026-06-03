export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="section-header">
        <div className="section-icon" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <div className="space-y-2">
          <div className="h-4 w-28 rounded bg-white/10" />
          <div className="h-3 w-64 rounded bg-white/5" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="h-5 w-20 rounded bg-white/10" />
            <div className="mt-4 h-10 rounded bg-white/8" />
          </div>
        ))}
      </div>
    </div>
  );
}