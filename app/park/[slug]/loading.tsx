import { Skeleton } from "@/components/ui/Skeleton";

export default function ParkLoading() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-24 md:px-6" aria-busy="true" aria-label="Loading park">
      <Skeleton className="-mx-4 h-56 rounded-none sm:h-72 md:mx-0 md:mt-6 md:h-[420px] md:rounded-[20px]" />
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4 md:mt-6">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-7 w-44 rounded-full" />
        </div>
        <Skeleton className="hidden h-10 w-40 rounded-full md:block" />
      </div>
      <Skeleton className="mt-4 h-12 w-full rounded-none" />
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <div className="space-y-6">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="hidden space-y-4 lg:block">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
