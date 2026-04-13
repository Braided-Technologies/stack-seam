// process-discovery-job: orchestrates discover-pair calls for a job
// Picks pending jobs, runs them through pair scans, updates progress
// Called either on-demand (after job creation) or via cron

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PARALLEL_PAIRS = 3;

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
  if (!res.ok) return { found: false };
  const data = await res.json();
  return { found: !!data.found, result: data };
}

async function processJob(jobId: string, supabase: any) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Mark as running
  await supabase.from('discovery_jobs').update({
    status: 'running',
    started_at: new Date().toISOString(),
  }).eq('id', jobId);

  // Load job
  const { data: job, error: jobErr } = await supabase
    .from('discovery_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    console.error('Job not found:', jobId);
    return;
  }

  try {
    // Build list of pairs based on job_type
    let pairs: AppPair[] = [];

    if (job.job_type === 'pair_scan' && job.result?.pair) {
      pairs = [job.result.pair];
    } else if (job.job_type === 'full_scan' || job.job_type === 'deep_scan') {
      // Get all user_applications for the org
      const { data: userApps } = await supabase
        .from('user_applications')
        .select('application_id')
        .eq('organization_id', job.organization_id);

      const appIds = (userApps || []).map((ua: any) => ua.application_id);

      if (job.job_type === 'deep_scan' && job.focus_app_id) {
        // Deep scan: focus app paired with each other app in stack
        pairs = appIds
          .filter((id: string) => id !== job.focus_app_id)
          .map((targetId: string) => ({
            source_app_id: job.focus_app_id,
            target_app_id: targetId,
          }));
      } else {
        // Full scan: every unique pair
        for (let i = 0; i < appIds.length; i++) {
          for (let j = i + 1; j < appIds.length; j++) {
            pairs.push({ source_app_id: appIds[i], target_app_id: appIds[j] });
          }
        }
      }
    }

    // Update total
    await supabase.from('discovery_jobs').update({ total_pairs: pairs.length }).eq('id', jobId);

    let foundCount = 0;
    let processedCount = 0;
    const foundIntegrations: any[] = [];

    // Process in parallel batches
    for (let i = 0; i < pairs.length; i += MAX_PARALLEL_PAIRS) {
      const batch = pairs.slice(i, i + MAX_PARALLEL_PAIRS);
      const results = await Promise.all(batch.map(p => discoverPair(supabaseUrl, serviceKey, p)));

      for (const r of results) {
        processedCount++;
        if (r.found && r.result) {
          foundCount++;
          foundIntegrations.push(r.result);

          // Upsert into integrations table
          await supabase.from('integrations').upsert({
            source_app_id: r.result.source_app_id,
            target_app_id: r.result.target_app_id,
            description: r.result.description,
            integration_type: r.result.integration_type,
            data_shared: r.result.data_shared,
            documentation_url: r.result.documentation_url,
            link_status: 'verified',
            confidence: r.result.confidence,
            source: 'discovery',
            status: 'approved',
            last_verified: new Date().toISOString(),
          }, { onConflict: 'source_app_id,target_app_id' });
        }
      }

      // Update progress
      await supabase.from('discovery_jobs').update({
        processed_pairs: processedCount,
        found_count: foundCount,
      }).eq('id', jobId);
    }

    // Mark complete
    await supabase.from('discovery_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: { found: foundIntegrations.length, integrations: foundIntegrations.map(i => ({ source_app_id: i.source_app_id, target_app_id: i.target_app_id, confidence: i.confidence })) },
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { job_id } = body;

    if (job_id) {
      // Process specific job
      // Run in background — return immediately
      processJob(job_id, supabase).catch(e => console.error('Background job error:', e));
      return new Response(JSON.stringify({ accepted: true, job_id }), {
        status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // No job_id: pick the next pending job
    const { data: pending } = await supabase
      .from('discovery_jobs')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!pending) {
      return new Response(JSON.stringify({ message: 'No pending jobs' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    processJob(pending.id, supabase).catch(e => console.error('Background job error:', e));
    return new Response(JSON.stringify({ accepted: true, job_id: pending.id }), {
      status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('process-discovery-job error:', e);
    return new Response(JSON.stringify({ error: e.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
