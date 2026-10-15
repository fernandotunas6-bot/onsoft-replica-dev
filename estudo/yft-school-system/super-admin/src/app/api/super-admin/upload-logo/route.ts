import { NextRequest, NextResponse } from 'next/server';
import { uploadSchoolLogo } from '@/lib/worker';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('logo');

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "logo" file' }, { status: 400 });
  }

  const result = await uploadSchoolLogo(file);
  return NextResponse.json(result, { status: 201 });
}
