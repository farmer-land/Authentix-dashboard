import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const { label, data } = body as { label?: string; data?: unknown };
  // eslint-disable-next-line no-console
  console.log(`\x1b[36m[Canvas]\x1b[0m ${label ?? ''}`, JSON.stringify(data, null, 2));
  return NextResponse.json({ ok: true });
}
