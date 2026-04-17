import { NextRequest, NextResponse } from 'next/server';

// Re-links an existing plan file to all locations whose reference_plan contains planName.
// Creates missing Plan records; does not delete any existing ones.

export async function POST(req: NextRequest) {
  const { projectId, planName, s3Key, fileType = 'pdf' } = await req.json();

  if (!projectId || !planName || !s3Key) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const { createClient } = await import('@lib/supabase/server');
  const supabase = await createClient();

  // Load locations for this project
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, reference_plan')
    .eq('project_id', projectId);

  // Find all locations that reference this plan
  const lower = planName.toLowerCase();
  const matched = (locations ?? []).filter((loc: any) => {
    const refs = (loc.reference_plan ?? '')
      .split(/[,;]/)
      .map((r: string) => r.trim().toLowerCase());
    return refs.includes(lower);
  });

  // Existing Plan records for this plan name
  const { data: existingPlans } = await supabase
    .from('plans')
    .select('id, location_id')
    .eq('project_id', projectId)
    .eq('name', planName);

  let linked = 0;

  for (const loc of matched) {
    const alreadyLinked = (existingPlans ?? []).some(
      (p: any) => p.location_id === loc.id,
    );
    if (!alreadyLinked) {
      const now = Date.now();
      const { error } = await supabase.from('plans').insert({
        project_id:  projectId,
        name:        planName,
        s3_key:      s3Key,
        file_type:   fileType,
        location_id: loc.id,
        created_at:  now,
        updated_at:  now,
      });
      if (!error) linked++;
      else console.error('[plans/relink] insert error:', error);
    }
  }

  // If no location matches exist and plan has only an unlinked record, keep it
  return NextResponse.json({ linked, total: matched.length });
}
