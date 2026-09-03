export default function DashboardLoading() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--surface2)' }} />
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ width: 112, height: 16, borderRadius: 4, background: 'var(--surface2)' }} />
          <div style={{ width: 256, height: 12, borderRadius: 4, background: 'var(--surface)' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', padding: 20 }}>
            <div style={{ width: 80, height: 20, borderRadius: 4, background: 'var(--surface2)', marginBottom: 16 }} />
            <div style={{ width: 160, height: 40, borderRadius: 4, background: 'var(--surface2)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}