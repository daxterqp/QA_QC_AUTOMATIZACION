import { NextRequest, NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.NEXT_PUBLIC_AWS_REGION!,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!,
  },
});
const BUCKET = process.env.NEXT_PUBLIC_AWS_BUCKET!;
const CHUNK = 50;

export async function POST(req: NextRequest) {
  const { protocolIds } = await req.json();
  if (!protocolIds?.length) {
    return NextResponse.json({ error: 'Missing protocolIds' }, { status: 400 });
  }

  const { createClient } = await import('@lib/supabase/server');
  const supabase = await createClient();

  // 1. Get protocol items (chunked)
  const allItemIds: string[] = [];
  for (let c = 0; c < protocolIds.length; c += CHUNK) {
    const batch = protocolIds.slice(c, c + CHUNK);
    const { data: items } = await supabase
      .from('protocol_items').select('id').in('protocol_id', batch);
    if (items) allItemIds.push(...items.map((i: { id: string }) => i.id));
  }

  if (allItemIds.length > 0) {
    // 2. Get evidences for S3 cleanup + delete (chunked)
    for (let c = 0; c < allItemIds.length; c += CHUNK) {
      const batch = allItemIds.slice(c, c + CHUNK);
      const { data: evidences } = await supabase
        .from('evidences').select('id, s3_key, s3_url_placeholder').in('protocol_item_id', batch);

      for (const ev of (evidences ?? []) as { id: string; s3_key?: string; s3_url_placeholder?: string }[]) {
        const key = ev.s3_key ?? ev.s3_url_placeholder;
        if (key && !key.startsWith('http')) {
          try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })); }
          catch (e) { console.warn('[protocols/delete] S3 cleanup failed:', key, e); }
        }
      }

      await supabase.from('evidences').delete().in('protocol_item_id', batch);
    }
  }

  // 3. Delete non_conformities (chunked)
  for (let c = 0; c < protocolIds.length; c += CHUNK) {
    const batch = protocolIds.slice(c, c + CHUNK);
    await supabase.from('non_conformities').delete().in('protocol_id', batch);
  }

  // 4. Delete protocol items (chunked)
  for (let c = 0; c < protocolIds.length; c += CHUNK) {
    const batch = protocolIds.slice(c, c + CHUNK);
    await supabase.from('protocol_items').delete().in('protocol_id', batch);
  }

  // 5. Delete protocols (chunked)
  for (let c = 0; c < protocolIds.length; c += CHUNK) {
    const batch = protocolIds.slice(c, c + CHUNK);
    await supabase.from('protocols').delete().in('id', batch);
  }

  return NextResponse.json({ deleted: protocolIds.length });
}
