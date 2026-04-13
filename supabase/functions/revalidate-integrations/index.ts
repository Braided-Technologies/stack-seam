// revalidate-integrations: weekly cron job that re-checks all integration URLs
// Updates link_status and last_verified

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
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Vary": "Origin",
  };
}

const BATCH_SIZE = 10;
const REQUEST_TIMEOUT_MS = 8000;

async function checkUrl(url: string): Promise<'verified' | 'dead'> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: c.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'StackSeam-LinkChecker/1.0' },
    });
    clearTimeout(t);

    if (res.ok) return 'verified';
    if (res.status === 405) {
      // Some servers reject HEAD; try GET
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), REQUEST_TIMEOUT_MS);
      const getRes = await fetch(url, {
        method: 'GET',
        signal: c2.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'StackSeam-LinkChecker/1.0' },
      });
      clearTimeout(t2);
      return getRes.ok ? 'verified' : 'dead';
    }
    return 'dead';
  } catch {
    return 'dead';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch integrations that haven't been checked in the last 6 days, or have URL
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const { data: integrations, error: fetchErr } = await supabase
      .from('integrations')
      .select('id, documentation_url, link_status, last_verified, confidence')
      .not('documentation_url', 'is', null)
      .neq('documentation_url', '')
      .or(`last_verified.is.null,last_verified.lt.${sixDaysAgo}`);

    if (fetchErr) throw fetchErr;

    const total = integrations?.length || 0;
    let checked = 0;
    let verified = 0;
    let dead = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = (integrations || []).slice(i, i + BATCH_SIZE);

      const results = await Promise.all(batch.map(async (integ: any) => {
        const status = await checkUrl(integ.documentation_url);
        return { id: integ.id, status, oldConfidence: integ.confidence };
      }));

      // Update each integration
      for (const r of results) {
        checked++;
        let newConfidence = r.oldConfidence;
        if (r.status === 'verified') {
          verified++;
          // Bump confidence slightly for re-verified links (cap at 100)
          newConfidence = Math.min((r.oldConfidence || 60) + 5, 100);
        } else {
          dead++;
          // Drop confidence for dead links (floor at 0)
          newConfidence = Math.max((r.oldConfidence || 60) - 30, 0);
        }

        await supabase.from('integrations').update({
          link_status: r.status,
          last_verified: new Date().toISOString(),
          confidence: newConfidence,
        }).eq('id', r.id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total,
      checked,
      verified,
      dead,
    }), { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('revalidate-integrations error:', e);
    return new Response(JSON.stringify({ error: e.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
