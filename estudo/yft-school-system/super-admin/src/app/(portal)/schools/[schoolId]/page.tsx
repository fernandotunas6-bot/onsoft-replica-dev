import { fetchSchool } from '@/lib/worker';
import { SchoolDetailEditor } from '@/components/schools/school-detail-editor';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolDetailPage({ params }: PageProps) {
  const { schoolId } = await params;
  const school = await fetchSchool(schoolId);

  return <SchoolDetailEditor school={school} />;
}
