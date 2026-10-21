import { UsageDashboardSkeleton } from "@/components/usage/usage-dashboard";

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div className="skeleton h-32 rounded-3xl" />
      <UsageDashboardSkeleton />
    </div>
  );
}
