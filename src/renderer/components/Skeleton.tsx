
interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`relative overflow-hidden bg-input rounded ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
    </div>
  );
}

export function MeetingCardSkeleton() {
  return (
    <div className="p-4 border-b border-edge">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/4" />
          <div className="flex items-center gap-1 mt-2">
            <Skeleton className="h-3 w-3" />
            <div className="flex -space-x-1">
              <Skeleton className="w-5 h-5 rounded-full" />
              <Skeleton className="w-5 h-5 rounded-full" />
              <Skeleton className="w-5 h-5 rounded-full" />
            </div>
          </div>
        </div>
        <Skeleton className="w-4 h-4" />
      </div>
    </div>
  );
}

export function PersonCardSkeleton() {
  return (
    <div className="p-4 border-b border-edge">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full bg-input" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-2/3 bg-input" />
          <Skeleton className="h-3 w-1/2 bg-input" />
        </div>
      </div>
      <div className="flex items-center gap-4 mt-2">
        <Skeleton className="h-3 w-20 bg-input" />
        <Skeleton className="h-3 w-16 bg-input" />
      </div>
    </div>
  );
}

interface ListSkeletonProps {
  count?: number;
  ItemComponent: React.ComponentType;
}

function ListSkeleton({ count = 5, ItemComponent }: ListSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <ItemComponent key={i} />
      ))}
    </>
  );
}

export function MeetingListSkeleton({ count = 5 }: { count?: number }) {
  return <ListSkeleton count={count} ItemComponent={MeetingCardSkeleton} />;
}

export function PersonListSkeleton({ count = 5 }: { count?: number }) {
  return <ListSkeleton count={count} ItemComponent={PersonCardSkeleton} />;
}

function DashboardRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="w-9 h-9 rounded-lg" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-3/5" />
        <Skeleton className="h-2.5 w-2/5" />
      </div>
      <Skeleton className="h-7 w-16 rounded-md" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="h-full flex flex-col items-center overflow-auto px-2 py-4">
      <div className="w-full max-w-3xl flex flex-col gap-3">
        {/* Upcoming meetings section */}
        <div className="rounded-xl border border-edge bg-card p-4 space-y-1">
          <Skeleton className="h-3 w-28 mb-3" />
          <DashboardRowSkeleton />
          <DashboardRowSkeleton />
          <DashboardRowSkeleton />
        </div>

        {/* Previous meetings section */}
        <div className="rounded-xl border border-edge bg-card p-4 space-y-1">
          <Skeleton className="h-3 w-32 mb-3" />
          <DashboardRowSkeleton />
          <DashboardRowSkeleton />
        </div>
      </div>
    </div>
  );
}

function SettingsFieldSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Heading */}
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-56 mt-2" />
        </div>

        {/* Section 1 */}
        <div className="space-y-4">
          <Skeleton className="h-5 w-20 border-b border-edge pb-2" />
          <SettingsFieldSkeleton />
          <SettingsFieldSkeleton />
        </div>

        {/* Section 2 */}
        <div className="space-y-4">
          <Skeleton className="h-5 w-28 border-b border-edge pb-2" />
          <SettingsFieldSkeleton />
          <SettingsFieldSkeleton />
          <SettingsFieldSkeleton />
        </div>
      </div>
    </div>
  );
}
