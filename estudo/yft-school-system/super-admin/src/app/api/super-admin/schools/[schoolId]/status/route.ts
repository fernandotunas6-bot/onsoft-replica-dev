import { NextRequest, NextResponse } from 'next/server';
import { updateSchoolStatus } from '@/lib/worker';

type RouteContext = {
  params: Promise<{ schoolId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { schoolId } = await context.params;
  const { is_active } = (await request.json().catch(() => ({}))) as { is_active?: boolean };
  if (typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'Invalid status payload' }, { status: 400 });
  }

  const result = await updateSchoolStatus(schoolId, is_active);
  return NextResponse.json(result);
}
