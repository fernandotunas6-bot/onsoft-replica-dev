import { SchoolsTable } from '@/components/schools/schools-table';
import { fetchSchools } from '@/lib/worker';

export const dynamic = 'force-dynamic';

export default async function SchoolsPage() {
  const schools = await fetchSchools();

  return (
    <div className="grid gap-6">
      <SchoolsTable schools={schools} />
    </div>
  );
}
