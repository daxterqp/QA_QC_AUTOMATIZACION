import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
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

async function ensureDbRecord(
  supabase: any,
  projectId: string,
  planName: string,
  s3Key: string,
  fileType: string,
  locations: { id: string; reference_plan: string }[],
  etag: string | null,
): Promise<number> {
  const matched = findMatchingLocations(planName, locations);
  const { data: existingPlans } = await supabase
    .from('plans')
    .select('id, location_id')
    .eq('project_id', projectId)
    .eq('name', planName);

  let created = 0;
  const now = Date.now();

  if (matched.length > 0) {
    for (const loc of matched) {
      const alreadyLinked = (existingPlans ?? []).some((p: any) => p.location_id === loc.id);
      if (!alreadyLinked) {
        const { error } = await supabase.from('plans').insert({
          project_id: projectId, name: planName, s3_key: s3Key,
          file_type: fileType, location_id: loc.id, s3_etag: etag,
          created_at: now, updated_at: now,
        });
        if (error) console.error('[plans/sync] insert error:', error);
        else created++;
      }
    }
  } else if ((existingPlans ?? []).length === 0) {
    const { error } = await supabase.from('plans').insert({
      project_id: projectId, name: planName, s3_key: s3Key,
      file_type: fileType, location_id: null, s3_etag: etag,
      created_at: now, updated_at: now,
    });
    if (error) console.error('[plans/sync] insert error (unlinked):', error);
    else created++;
  }

  return created;
}

// Update s3_etag on all DB records for a given plan name
async function updateDbEtag(
  supabase: any, projectId: string, planName: string, etag: string,
) {
  await supabase
    .from('plans')
    .update({ s3_etag: etag, updated_at: Date.now() })
    .eq('project_id', projectId)
    .eq('name', planName);
}

export async function POST(req: NextRequest) {
  const { projectId, projectName, type: fileType = 'pdf' } = await req.json();

  if (!projectId || !projectName) {
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
  const prefix   = `projects/${sanitize(projectName)}/${folder}/`;
  const localDir = path.join(LOCAL_BASE, sanitize(projectName), folder);

  try { fs.mkdirSync(localDir, { recursive: true }); } catch { /* ignore */ }

  const isValidFile = (f: string) =>
    !f.startsWith('.') && f !== 'keep' && !f.endsWith('.keep');

  const stats = { downloaded: 0, uploaded: 0, updated: 0, db_created: 0, skipped: 0 };

  // ── Local files ────────────────────────────────────────────────────────────
  const localFiles = new Set<string>();
  try {
    for (const f of fs.readdirSync(localDir).filter(isValidFile)) {
      localFiles.add(f);
    }
  } catch { /* empty */ }

  // ── S3 files (with ETag) ───────────────────────────────────────────────────
  interface S3Info { key: string; etag: string }
  const s3Map = new Map<string, S3Info>();

  const listResp = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
  for (const obj of (listResp.Contents ?? [])) {
    const filename = obj.Key!.split('/').pop()!;
    if (filename && isValidFile(filename)) {
      s3Map.set(filename, {
        key: obj.Key!,
        etag: (obj.ETag ?? '').replace(/"/g, ''),
      });
    }
  }

  // ── DB ETags (for change detection) ────────────────────────────────────────
  const { data: dbPlans } = await supabase
    .from('plans')
    .select('name, s3_etag')
    .eq('project_id', projectId)
    .eq('file_type', fileType);

  // Map planName → known ETag from DB
  const dbEtagByName = new Map<string, string>();
  for (const p of (dbPlans ?? []) as any[]) {
    if (p.s3_etag && !dbEtagByName.has(p.name)) {
      dbEtagByName.set(p.name, p.s3_etag);
    }
  }

  const contentType = fileType === 'dwg' ? 'application/acad' : 'application/pdf';

  // ── Sync ───────────────────────────────────────────────────────────────────

  const allFilenames = new Set([...localFiles, ...s3Map.keys()]);

  for (const filename of allFilenames) {
    const inLocal = localFiles.has(filename);
    const s3Info  = s3Map.get(filename);
    const s3Key   = s3Info?.key ?? `${prefix}${filename}`;
    const s3Etag  = s3Info?.etag ?? null;
    const localPath = path.join(localDir, filename);
    const planName  = filename.replace(/\.(pdf|dwg)$/i, '');

    if (inLocal && s3Info) {
      // ── Both exist → check if S3 version changed (ETag differs from DB) ──
      const dbEtag = dbEtagByName.get(planName);

      if (dbEtag && s3Etag && dbEtag !== s3Etag) {
        // S3 has a newer version → download to local + update DB ETag
        try {
          const resp  = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
          const bytes = await resp.Body!.transformToByteArray();
          fs.writeFileSync(localPath, Buffer.from(bytes));
          await updateDbEtag(supabase, projectId, planName, s3Etag);
          stats.updated++;
          console.log(`[sync] ${filename}: S3→local (ETag changed: ${dbEtag} → ${s3Etag})`);
        } catch (e) {
          console.warn('[sync] download failed:', filename, e);
        }
      } else if (!dbEtag && s3Etag) {
        // DB has no ETag yet → just store it (no transfer needed)
        await updateDbEtag(supabase, projectId, planName, s3Etag);
        stats.skipped++;
      } else {
        // ETags match → skip, no transfer
        stats.skipped++;
      }

      // Ensure DB record exists
      const count = await ensureDbRecord(supabase, projectId, planName, s3Key, fileType, locations ?? [], s3Etag);
      stats.db_created += count;

    } else if (inLocal && !s3Info) {
      // ── Only in local → upload to S3 ──────────────────────────────────
      try {
        const bytes = fs.readFileSync(localPath);
        const putResp = await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET, Key: s3Key, Body: bytes, ContentType: contentType,
        }));
        const etag = putResp.ETag?.replace(/"/g, '') ?? null;
        stats.uploaded++;

        const count = await ensureDbRecord(supabase, projectId, planName, s3Key, fileType, locations ?? [], etag);
        stats.db_created += count;
        if (etag) await updateDbEtag(supabase, projectId, planName, etag);
      } catch (e) {
        console.warn('[sync] upload failed:', filename, e);
      }

    } else if (!inLocal && s3Info) {
      // ── Only in S3 → download to local ────────────────────────────────
      try {
        const resp  = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
        const bytes = await resp.Body!.transformToByteArray();
        fs.writeFileSync(localPath, Buffer.from(bytes));
        stats.downloaded++;

        const count = await ensureDbRecord(supabase, projectId, planName, s3Key, fileType, locations ?? [], s3Etag);
        stats.db_created += count;
        if (s3Etag) await updateDbEtag(supabase, projectId, planName, s3Etag);
      } catch (e) {
        console.warn('[sync] download failed:', filename, e);
      }
    }
  }

  // Re-count for summary
  let finalLocalCount = 0;
  try { finalLocalCount = fs.readdirSync(localDir).filter(isValidFile).length; } catch {}

  return NextResponse.json({
    ok: true,
    stats,
    summary: {
      local: finalLocalCount,
      cloud: s3Map.size,
    },
  });
}
