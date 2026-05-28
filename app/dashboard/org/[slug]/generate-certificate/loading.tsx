
export default function GenerateCertificateLoading() {
  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Loading skeleton for the certificate generator */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar skeleton */}
        <div className="w-64 border-r bg-card flex flex-col">
          <div className="p-4 space-y-4">
            <div className="h-10 w-full bg-muted animate-pulse rounded" />
            <div className="space-y-2">
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
              <div className="grid grid-cols-3 gap-2">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-16 bg-muted animate-pulse rounded"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Center canvas skeleton */}
        <div className="flex-1 bg-muted/20 flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-2xl aspect-[4/3] bg-muted animate-pulse rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
