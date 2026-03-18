import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { analyseContent } from '@/lib/anthropic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { text: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
    return NextResponse.json({ error: 'Text content is required' }, { status: 400 });
  }

  try {
    const result = await analyseContent(body.text);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed — please try again.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
