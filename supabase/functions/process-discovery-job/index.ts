// process-discovery-job: orchestrates discover-pair calls for a job
// Picks pending jobs, runs them through pair scans, updates progress
// Called either on-demand (after job creation) or via cron

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const ALLOWED_ORIGINS = [
  "https://stackseam.tech",
  "https://www.stackseam.tech",
  "http://localhost:8080",
  "http://localhost:5173",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
}

const MAX_PARALLEL_PAIRS = 1;
const DELAY_BETWEEN_BATCHES_MS = 2000;
const CACHE_TTL_DAYS = 30;
const BATCH_PAIRS_PER_INVOCATION = 8;

async function reinvokeSelf(supabaseUrl: string, serviceKey: string, jobId: string): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/functions/v1/process-discovery-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ job_id: jobId }),
    });
  } catch (e) {
    console.error('Self re-invoke failed:', e);
  }
}

interface AppPair {
  source_app_id: string;
  target_app_id: string;
}

async function discoverPair(supabaseUrl: string, serviceKey: string, pair: AppPair): Promise<{ found: boolean; result?: any }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/discover-pair`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(pair),
  });
  if (res.status === 503) {
    let msg = 'search_backend_failed';
    try { const body = await res.json(); msg = body.error || msg; } catch {}
    throw new Error(`search_backend_failed: ${msg}`);
  }
  if (!res.ok) return { found: false };
  const data = await res.json();
  return { found: !!data.found, result: data };
}

async function processJob(jobId: string, supabase: any) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const { data: job, error: jobErr } = await supabase
    .from('discovery_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    console.error('Job not found:', jobId);
    return;
  }

  if (!job.started_at) {
    await supabase.from('discovery_jobs').update({
      status: 'running',
      started_at: new Date().toISOString(),
    }).eq('id', jobId);
  }

  try {
    let isPlatformAdminJob = job.job_type === 'catalog_refresh';
    let isOrgAdminJob = false;

    if (!isPlatformAdminJob) {
      const { data: creatorRole } = await supabase
        .from('user_roles')
        .select('role, organization_id')
        .eq('user_id', job.created_by)
        .maybeSingle();
      isPlatformAdminJob = creatorRole?.role === 'platform_admin';
      isOrgAdminJob = creatorRole?.role === 'admin'
        && creatorRole.organization_id === job.organization_id;

      if (!isPlatformAdminJob && !isOrgAdminJob) {
        await supabase.from('discovery_jobs').update({
          status: 'failed',
          error_message: 'User is not authorized to run discovery for this organization',
          completed_at: new Date().toISOString(),
        }).eq('id', jobId);
        return;
      }
    }

    const existingResult = (job.result || {}) as any;
    const alreadyBuilt = Array.isArray(existingResult.remaining_pairs);
    let pairs: AppPair[] = alreadyBuilt ? existingResult.remaining_pairs : [];
    let foundIntegrations: any[] = Array.isArray(existingResult.integrations) ? existingResult.integrations : [];

    if (!alreadyBuilt) {
    // Blacklisted entries are permanent; everything else honors CACHE_TTL_DAYS.
    const cacheCutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: cachedPairs } = await supabase
      .from('discovery_cache')
      .select('source_app_id, target_app_id, result_status')
      .or(`result_status.eq.blacklisted,scanned_at.gte.${cacheCutoff}`);
    const cachedSet = new Set<string>();
    for (const c of cachedPairs || []) {
      cachedSet.add(`${(c as any).source_app_id}|${(c as any).target_app_id}`);
      cachedSet.add(`${(c as any).target_app_id}|${(c as any).source_app_id}`);
    }

    const { data: existingIntegrations } = await supabase
      .from('integrations')
      .select('source_app_id, target_app_id');
    const existingSet = new Set<string>();
    for (const i of existingIntegrations || []) {
      existingSet.add(`${(i as any).source_app_id}|${(i as any).target_app_id}`);
      existingSet.add(`${(i as any).target_app_id}|${(i as any).source_app_id}`);
    }

    if (job.job_type === 'pair_scan' && job.result?.pair) {
      pairs = [job.result.pair];
    } else if (job.job_type === 'full_scan' || job.job_type === 'deep_scan') {
      const { data: userApps } = await supabase
        .from('user_applications')
        .select('application_id')
        .eq('organization_id', job.organization_id);

      const appIds = (userApps || []).map((ua: any) => ua.application_id);

      let candidatePairs: AppPair[] = [];
      if (job.job_type === 'deep_scan' && job.focus_app_id) {
        candidatePairs = appIds
          .filter((id: string) => id !== job.focus_app_id)
          .map((targetId: string) => ({
            source_app_id: job.focus_app_id,
            target_app_id: targetId,
          }));
      } else {
        for (let i = 0; i < appIds.length; i++) {
          for (let j = i + 1; j < appIds.length; j++) {
            candidatePairs.push({ source_app_id: appIds[i], target_app_id: appIds[j] });
          }
        }
      }

      const skipExisting = job.job_type === 'full_scan';
      pairs = candidatePairs.filter(p => {
        const key = `${p.source_app_id}|${p.target_app_id}`;
        if (cachedSet.has(key)) return false;
        if (skipExisting && existingSet.has(key)) return false;
        return true;
      });
    } else if (job.job_type === 'catalog_refresh') {
      if (job.focus_app_id) {
        const { data: approvedApps } = await supabase
          .from('applications')
          .select('id')
          .eq('status', 'approved')
          .neq('id', job.focus_app_id);
        const candidatePairs: AppPair[] = (approvedApps || []).map((a: any) => ({
          source_app_id: job.focus_app_id,
          target_app_id: a.id,
        }));
        pairs = candidatePairs.filter(p => {
          const key = `${p.source_app_id}|${p.target_app_id}`;
          return !cachedSet.has(key) && !existingSet.has(key);
        });
      } else {
        const { data: usedApps } = await supabase
          .from('user_applications')
          .select('application_id');
        const usedAppIds = Array.from(new Set((usedApps || []).map((u: any) => u.application_id)));

        const { data: approvedRows } = await supabase
          .from('applications')
          .select('id')
          .eq('status', 'approved')
          .in('id', usedAppIds);
        const approvedIds = (approvedRows || []).map((r: any) => r.id);

        const candidatePairs: AppPair[] = [];
        for (let i = 0; i < approvedIds.length; i++) {
          for (let j = i + 1; j < approvedIds.length; j++) {
            candidatePairs.push({ source_app_id: approvedIds[i], target_app_id: approvedIds[j] });
          }
        }
        pairs = candidatePairs.filter(p => {
          const key = `${p.source_app_id}|${p.target_app_id}`;
          return !cachedSet.has(key) && !existingSet.has(key);
        });
      }
    }

    await supabase.from('discovery_jobs').update({
      total_pairs: pairs.length,
      result: { remaining_pairs: pairs, integrations: [], found: 0 },
    }).eq('id', jobId);

    if (pairs.length === 0) {
      await supabase.from('discovery_jobs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: { found: 0, integrations: [], note: 'All pairs already scanned recently or have existing integrations' },
      }).eq('id', jobId);
      return;
    }
    } // end !alreadyBuilt

    const batchPairs = pairs.slice(0, BATCH_PAIRS_PER_INVOCATION);
    const leftoverPairs = pairs.slice(BATCH_PAIRS_PER_INVOCATION);
    let foundCount = foundIntegrations.length;
    let processedCount = job.processed_pairs || 0;

    for (let i = 0; i < batchPairs.length; i += MAX_PARALLEL_PAIRS) {
      const batch = batchPairs.slice(i, i + MAX_PARALLEL_PAIRS);
      const results = await Promise.all(batch.map(p => discoverPair(supabaseUrl, serviceKey, p)));

      for (const r of results) {
        processedCount++;
        if (r.found && r.result) {
          const saveStatus = isPlatformAdminJob ? 'approved' : 'pending';

          const { data: existingReverse } = await supabase
            .from('integrations')
            .select('id, documentation_url, status')
            .eq('source_app_id', r.result.target_app_id)
            .eq('target_app_id', r.result.source_app_id)
            .maybeSingle();

          let integrationId: string | null = null;
          if (existingReverse) {
            const { data: updated } = await supabase.from('integrations').update({
              description: r.result.description,
              integration_type: r.result.integration_type,
              data_shared: r.result.data_shared,
              documentation_url: r.result.documentation_url || existingReverse.documentation_url,
              link_status: 'verified',
              confidence: r.result.confidence,
              last_verified: new Date().toISOString(),
            }).eq('id', existingReverse.id).select('id').single();
            integrationId = updated?.id || existingReverse.id;
          } else {
            const insertPayload: any = {
              source_app_id: r.result.source_app_id,
              target_app_id: r.result.target_app_id,
              description: r.result.description,
              integration_type: r.result.integration_type,
              data_shared: r.result.data_shared,
              documentation_url: r.result.documentation_url,
              link_status: 'verified',
              confidence: r.result.confidence,
              source: 'discovery',
              status: saveStatus,
              last_verified: new Date().toISOString(),
            };
            if (saveStatus === 'pending') {
              insertPayload.submitted_by_org = job.organization_id;
              insertPayload.submitted_by_user = job.created_by;
            }
            const { data: upserted } = await supabase
              .from('integrations')
              .upsert(insertPayload, { onConflict: 'source_app_id,target_app_id' })
              .select('id')
              .single();
            integrationId = upserted?.id || null;
          }

          if (integrationId && job.job_type !== 'catalog_refresh') {
            await supabase.from('org_integrations').upsert({
              organization_id: job.organization_id,
              integration_id: integrationId,
              status: 'pending',
            }, { onConflict: 'organization_id,integration_id' });
          }

          foundCount++;
          foundIntegrations.push(r.result);
        }
      }

      await supabase.from('discovery_jobs').update({
        processed_pairs: processedCount,
        found_count: foundCount,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      if (i + MAX_PARALLEL_PAIRS < batchPairs.length) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    const slimIntegrations = foundIntegrations.map(i => ({
      source_app_id: i.source_app_id,
      target_app_id: i.target_app_id,
      confidence: i.confidence,
    }));

    if (leftoverPairs.length > 0) {
      await supabase.from('discovery_jobs').update({
        processed_pairs: processedCount,
        found_count: foundCount,
        updated_at: new Date().toISOString(),
        result: {
          remaining_pairs: leftoverPairs,
          integrations: slimIntegrations,
          found: foundCount,
        },
      }).eq('id', jobId);
      await reinvokeSelf(supabaseUrl, serviceKey, jobId);
      return;
    }

    await supabase.from('discovery_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      processed_pairs: processedCount,
      found_count: foundCount,
      updated_at: new Date().toISOString(),
      result: { found: foundCount, integrations: slimIntegrations },
    }).eq('id', jobId);

  } catch (e: any) {
    console.error('Job processing error:', e);
    await supabase.from('discovery_jobs').update({
      status: 'failed',
      error_message: e.message || 'Unknown error',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { job_id } = body;

    if (job_id) {
      // @ts-ignore - EdgeRuntime is a Deno Deploy global available in Supabase Edge Functions
      EdgeRuntime.waitUntil(processJob(job_id, supabase).catch(e => console.error('Background job error:', e)));
      return new Response(JSON.stringify({ accepted: true, job_id }), {
        status: 202, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { data: pending } = await supabase
      .from('discovery_jobs')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!pending) {
      return new Response(JSON.stringify({ message: 'No pending jobs' }), {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // @ts-ignore - EdgeRuntime is a Deno Deploy global available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processJob(pending.id, supabase).catch(e => console.error('Background job error:', e)));
    return new Response(JSON.stringify({ accepted: true, job_id: pending.id }), {
      status: 202, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('process-discovery-job error:', e);
    return new Response(JSON.stringify({ error: e.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
