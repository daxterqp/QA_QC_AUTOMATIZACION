import { NextRequest, NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const REGION     = process.env.NEXT_PUBLIC_AWS_REGION!;
const BUCKET     = process.env.NEXT_PUBLIC_AWS_BUCKET!;
const ACCESS_KEY = process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!;
const SECRET_KEY = process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!;
const LOCAL_BASE = process.env.LOCAL_PLANS_CACHE ?? 'D:\\Flow-QAQC';

function sanitize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

export async function POST(req: NextRequest) {
  const { projectId, projectName, filenames, type: fileType = 'pdf' } = await req.json();

  if (!projectId || !projectName || !filenames || filenames.length === 0) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const { createClient } = await import('@lib/supabase/server');
  const supabase = await createClient();

  const s3Client = new S3Client({
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  });

  const folder   = fileType === 'dwg' ? 'plansdwg' : 'plans';
  const prefix   = `projects/${sanitize(projectName)}/${folder}`;
  const localDir = path.join(LOCAL_BASE, sanitize(projectName), folder);

  let deleted = 0;

  for (const filename of filenames as string[]) {
    const planName = filename.replace(/\.(pdf|dwg)$/i, '');

    // 1. Delete from local disk
    try {
      const localPath = path.join(localDir, filename);
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch (e) {
      console.warn('[plans/delete] local delete failed:', filename, e);
    }

    // 2. Delete from S3
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: `${prefix}/${filename}`,
      }));
    } catch (e) {
      console.warn('[plans/delete] S3 delete failed:', filename, e);
    }

    // 3. Delete DB records
    const { error } = await supabase
      .from('plans')
      .delete()
      .eq('project_id', projectId)
      .eq('name', planName);
    if (error) console.warn('[plans/delete] DB delete failed:', planName, error);

    deleted++;
  }

  return NextResponse.json({ deleted });
}
