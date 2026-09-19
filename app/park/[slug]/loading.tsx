import { Skeleton } from "@/components/ui/Skeleton";

export default function ParkLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl pb-24" aria-busy="true" aria-label="Loading park">
      <Skeleton className="h-56 w-full rounded-none" />
      <div className="space-y-4 px-4 pt-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
