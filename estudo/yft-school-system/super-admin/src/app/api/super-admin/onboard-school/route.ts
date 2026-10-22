import { NextRequest, NextResponse } from 'next/server';
import { onboardSchool } from '@/lib/worker';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await onboardSchool(body);
  return NextResponse.json(result, { status: 201 });
}
