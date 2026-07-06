export default function LoadingPosPreview() {
  return (
    <main className="flex h-screen w-screen overflow-hidden bg-slate-50">
      <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden pl-4 pr-2 py-4 lg:pl-5 lg:pr-3">
        <div className="grid h-full w-full place-items-center rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" aria-hidden />
            Loading menu...
          </div>
        </div>
      </section>
    </main>
  );
}

