import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { clerkClient } from '@clerk/nextjs/server';

interface ClerkWebhookEvent {
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
    first_name?: string | null;
    last_name?: string | null;
    public_metadata?: Record<string, unknown>;
  };
  type: string;
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  const headerPayload = headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 }
    );
  }

  const body = await req.text();
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: ClerkWebhookEvent;
  try {
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const { type, data } = evt;

  if (type === 'user.created') {
    const email = data.email_addresses?.[0]?.email_address ?? '';

    // Set default role in Clerk publicMetadata
    try {
      await clerkClient.users.updateUser(data.id, {
        publicMetadata: {
          ...data.public_metadata,
          role: 'team_member',
        },
      });
    } catch (e) {
      console.error('Failed to set default role in Clerk:', e);
    }

    // Sync to Supabase
    await supabaseAdmin.from('users').upsert({
      id: data.id,
      email,
      first_name: data.first_name ?? null,
      last_name: data.last_name ?? null,
      role: 'team_member',
    });
  }

  if (type === 'user.updated') {
    const email = data.email_addresses?.[0]?.email_address ?? '';
    const role = (data.public_metadata?.role as string) ?? 'team_member';

    await supabaseAdmin.from('users').upsert({
      id: data.id,
      email,
      first_name: data.first_name ?? null,
      last_name: data.last_name ?? null,
      role,
    });
  }

  if (type === 'user.deleted') {
    await supabaseAdmin.from('users').delete().eq('id', data.id);
  }

  return NextResponse.json({ received: true });
}
