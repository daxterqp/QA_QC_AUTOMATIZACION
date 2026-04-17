import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.NEXT_PUBLIC_AWS_REGION!,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(req: NextRequest) {
  const prefix = req.nextUrl.searchParams.get('prefix');
  if (!prefix) return NextResponse.json({ keys: [] });

  const resp = await s3.send(new ListObjectsV2Command({
    Bucket: process.env.NEXT_PUBLIC_AWS_BUCKET!,
    Prefix: prefix,
  }));

  const keys = (resp.Contents ?? [])
    .map(o => o.Key!)
    .filter(k => k && !k.endsWith('/'));

  return NextResponse.json({ keys });
}
