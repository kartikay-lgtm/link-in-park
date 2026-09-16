export default function ModalLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6" style={{ background: 'rgba(17,24,39,.45)' }}>
      <div className="card w-full max-w-6xl p-10 text-center muted">Loading campaign…</div>
    </div>
  );
}
