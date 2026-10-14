import { NextRequest, NextResponse } from 'next/server';
import { updateSchool, deleteSchool } from '@/lib/worker';

type RouteContext = {
  params: Promise<{ schoolId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { schoolId } = await context.params;
    const body = await request.json();
    const result = await updateSchool(schoolId, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { schoolId } = await context.params;
    const result = await deleteSchool(schoolId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
