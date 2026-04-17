import { NextRequest, NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.NEXT_PUBLIC_AWS_REGION!,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest) {
  const { key } = await req.json();
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

  await s3.send(new DeleteObjectCommand({
    Bucket: process.env.NEXT_PUBLIC_AWS_BUCKET!,
    Key: key,
  }));

  return NextResponse.json({ ok: true });
}
