import { DashboardView } from '@/components/dashboard/dashboard-view';
import { fetchMetrics, fetchSchools } from '@/lib/worker';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [metrics, schools] = await Promise.all([fetchMetrics(), fetchSchools()]);

  return (
    <DashboardView
      metrics={metrics}
      trend={metrics.historical_trends ?? []}
      recentSchools={schools.slice(0, 4).map((school) => ({
        id: school.id,
        name: school.name,
        location: school.location,
        is_active: school.is_active,
      }))}
    />
  );
}
