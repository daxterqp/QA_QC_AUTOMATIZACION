import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

function findMatchingLocations(
  planName: string,
  locations: { id: string; reference_plan: string }[],
) {
  const lower = planName.toLowerCase();
  return locations.filter(loc => {
    const refs = (loc.reference_plan ?? '')
      .split(/[,;]/)
      .map(r => r.trim().toLowerCase());
    return refs.includes(lower);
  });
}

export async function POST(req: NextRequest) {
  const formData    = await req.formData();
  const projectId   = formData.get('projectId')   as string;
  const projectName = formData.get('projectName') as string;
  const fileType    = (formData.get('type') as string) ?? 'pdf';
  const files       = formData.getAll('files')    as File[];

  if (!projectId || !projectName || files.length === 0) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const { createClient } = await import('@lib/supabase/server');
  const supabase = await createClient();

  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, reference_plan')
    .eq('project_id', projectId);

  const s3Client = new S3Client({
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  });

  const folder   = fileType === 'dwg' ? 'plansdwg' : 'plans';
  const prefix   = `projects/${sanitize(projectName)}/${folder}`;
  const localDir = path.join(LOCAL_BASE, sanitize(projectName), folder);

  try { fs.mkdirSync(localDir, { recursive: true }); } catch { /* ignore */ }

  const results: { name: string; matched: number }[] = [];

  for (const file of files) {
    const bytes     = new Uint8Array(await file.arrayBuffer());
    const filename  = file.name;
    const planName  = filename.replace(/\.(pdf|dwg)$/i, '');
    const s3Key     = `${prefix}/${filename}`;
    const localPath = path.join(localDir, filename);

    // 1. Save to local disk
    try { fs.writeFileSync(localPath, bytes); } catch (e) {
      console.warn('[plans/upload] disk write failed:', localPath, e);
    }

    // 2. Upload to S3 and capture ETag
    const putResp = await s3Client.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         s3Key,
      Body:        bytes,
      ContentType: fileType === 'dwg' ? 'application/acad' : 'application/pdf',
    }));
    const etag = putResp.ETag?.replace(/"/g, '') ?? null;

    // 3. Link to matching locations (with ETag)
    const matched = findMatchingLocations(planName, (locations ?? []) as any);

    const now = Date.now();

    // Update ETag on ALL existing records for this plan name (covers re-upload of same name)
    await supabase
      .from('plans')
      .update({ s3_etag: etag, s3_key: s3Key, updated_at: now })
      .eq('project_id', projectId)
      .eq('name', planName);

    if (matched.length > 0) {
      for (const loc of matched) {
        const { data: existing } = await supabase
          .from('plans')
          .select('id')
          .eq('project_id', projectId)
          .eq('name', planName)
          .eq('location_id', loc.id)
          .maybeSingle();
        if (!existing) {
          const { error: insertErr } = await supabase.from('plans').insert({
            project_id:  projectId,
            name:        planName,
            s3_key:      s3Key,
            file_type:   fileType,
            location_id: loc.id,
            s3_etag:     etag,
            created_at:  now,
            updated_at:  now,
          });
          if (insertErr) console.error('[plans/upload] insert error:', insertErr);
        }
      }
    } else {
      // Create one unlinked record
      const { data: existing } = await supabase
        .from('plans')
        .select('id')
        .eq('project_id', projectId)
        .eq('name', planName)
        .is('location_id', null)
        .maybeSingle();
      if (!existing) {
        const { error: insertErr } = await supabase.from('plans').insert({
          project_id:  projectId,
          name:        planName,
          s3_key:      s3Key,
          file_type:   fileType,
          location_id: null,
          s3_etag:     etag,
          created_at:  now,
          updated_at:  now,
        });
        if (insertErr) console.error('[plans/upload] insert error (unlinked):', insertErr);
      }
    }

    results.push({ name: planName, matched: matched.length });
  }

  return NextResponse.json({ results });
}
