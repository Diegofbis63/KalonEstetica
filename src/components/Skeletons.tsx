import { cn } from "@/lib/utils";

export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-white/5", className)}
      {...props}
    />
  );
};

export const DashboardSkeleton = () => {
  return (
    <div className="space-y-12 w-full animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-6 rounded-2xl border border-white/[0.03] bg-noir-light/20 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <Skeleton className="w-32 h-4" />
            </div>
            <Skeleton className="w-20 h-10 mt-2" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
        <div className="lg:col-span-7 space-y-6">
          <Skeleton className="w-48 h-8 mb-4" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-6 w-full">
                <Skeleton className="w-16 h-12" />
                <Skeleton className="w-full h-24 rounded-2xl" />
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-3 space-y-6">
          <Skeleton className="w-full h-40 rounded-3xl" />
          <Skeleton className="w-full h-64 rounded-xl" />
        </div>
      </div>
    </div>
  );
};

export const SliderSkeleton = () => {
  return (
    <div className="flex gap-6 overflow-hidden pb-16">
      {[1, 2, 3].map(i => (
        <div key={i} className="w-full md:w-1/3 shrink-0 flex flex-col">
          <Skeleton className="w-full h-[400px] rounded-3xl" />
        </div>
      ))}
    </div>
  );
};

export const TableSkeleton = ({ rows = 5 }) => {
  return (
    <div className="space-y-4 w-full">
      <Skeleton className="w-full h-12 rounded-lg" />
      {[...Array(rows)].map((_, i) => (
        <Skeleton key={i} className="w-full h-16 rounded-xl" />
      ))}
    </div>
  );
};
