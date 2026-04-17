import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

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

const VALID_EXTENSIONS = /\.(pdf|dwg)$/i;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectName = searchParams.get('projectName') ?? '';
  const projectId   = searchParams.get('projectId')   ?? '';
  const fileType    = searchParams.get('type') ?? 'pdf';

  if (!projectName || !projectId) {
    return NextResponse.json({ files: [] });
  }

  const folder   = fileType === 'dwg' ? 'plansdwg' : 'plans';
  const localDir = path.join(LOCAL_BASE, sanitize(projectName), folder);

  // 1. Read local files
  let filenames: string[] = [];
  try {
    filenames = fs.readdirSync(localDir).filter(
      f => !f.startsWith('.') && !f.endsWith('.keep') && VALID_EXTENSIONS.test(f)
    );
  } catch {
    filenames = [];
  }

  if (filenames.length === 0) {
    return NextResponse.json({ files: [] });
  }

  // 2. Get plan records + location names from Supabase
  const { createClient } = await import('@lib/supabase/server');
  const supabase = await createClient();

  const { data: plans } = await supabase
    .from('plans')
    .select('name, s3_key, location_id')
    .eq('project_id', projectId);

  // Get all locations for this project to resolve names
  const { data: locs } = await supabase
    .from('locations')
    .select('id, name, reference_plan')
    .eq('project_id', projectId);

  const locNameById = new Map<string, string>();
  for (const l of (locs ?? []) as any[]) {
    locNameById.set(l.id, l.name);
  }

  // Build maps: planName (lowercase) → { locations[], s3Key }
  const locationsByPlan: Record<string, string[]> = {};
  const s3KeyByPlan: Record<string, string> = {};

  // From DB plan records (location_id joins)
  for (const p of (plans ?? []) as any[]) {
    const nameKey = (p.name as string).toLowerCase();
    if (!locationsByPlan[nameKey]) locationsByPlan[nameKey] = [];
    if (p.location_id) {
      const locName = locNameById.get(p.location_id);
      if (locName && !locationsByPlan[nameKey].includes(locName)) {
        locationsByPlan[nameKey].push(locName);
      }
    }
    if (p.s3_key && !s3KeyByPlan[nameKey]) {
      s3KeyByPlan[nameKey] = p.s3_key;
    }
  }

  // Fallback: check locations.reference_plan for matches
  for (const l of (locs ?? []) as any[]) {
    const refs = ((l.reference_plan as string) ?? '')
      .split(/[,;]/)
      .map((r: string) => r.trim().toLowerCase())
      .filter(Boolean);
    for (const ref of refs) {
      if (!locationsByPlan[ref]) locationsByPlan[ref] = [];
      if (!locationsByPlan[ref].includes(l.name)) {
        locationsByPlan[ref].push(l.name);
      }
    }
  }

  // 3. Build response
  const files = filenames
    .map(filename => {
      const planName  = filename.replace(VALID_EXTENSIONS, '');
      const planKey   = planName.toLowerCase();
      const localPath = path.join(localDir, filename);
      return {
        filename,
        planName,
        localPath,
        s3Key:     s3KeyByPlan[planKey] ?? null,
        locations: locationsByPlan[planKey] ?? [],
      };
    })
    .sort((a, b) => a.filename.localeCompare(b.filename));

  return NextResponse.json({ files });
}
