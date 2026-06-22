import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getServerUser } from '@lib/serverAuth';
import { keyBelongsToAccessibleProject } from '../s3-shared/projectAccess';

export async function GET(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  // Autorización horizontal (lectura): keys `projects/<seg>/...` deben pertenecer
  // a un proyecto accesible. Assets globales (no `projects/...`) se permiten al
  // usuario autenticado (allowGlobal=true).
  const allowed = await keyBelongsToAccessibleProject(key, { allowGlobal: true });
  if (!allowed) return new Response('Forbidden', { status: 403 });

  const region = process.env.NEXT_PUBLIC_AWS_REGION!;
  const bucket = process.env.NEXT_PUBLIC_AWS_BUCKET!;
  const accessKeyId = process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!;

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 3600 },
  );

  return NextResponse.json({ url }, {
    headers: { 'Cache-Control': 'private, max-age=3000' },
  });
}
