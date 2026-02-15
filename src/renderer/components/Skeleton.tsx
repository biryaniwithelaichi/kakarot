
interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`relative overflow-hidden bg-[#1E1E1E] rounded ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
    </div>
  );
}

export function MeetingCardSkeleton() {
  return (
    <div className="p-4 border-b border-[#2A2A2A]">
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
    <div className="p-4 border-b border-[#2A2A2A]">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full bg-[#1E1E1E]" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-2/3 bg-[#1E1E1E]" />
          <Skeleton className="h-3 w-1/2 bg-[#1E1E1E]" />
        </div>
      </div>
      <div className="flex items-center gap-4 mt-2">
        <Skeleton className="h-3 w-20 bg-[#1E1E1E]" />
        <Skeleton className="h-3 w-16 bg-[#1E1E1E]" />
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
