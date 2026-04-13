// discover-pair: discovers integrations between exactly 2 apps
// Strategy: Brave Search for real URLs → fetch + verify content → AI structured extraction
// Returns confidence-scored result, caches outcome to avoid re-scanning

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CACHE_TTL_DAYS = 30;

interface PairResult {
  found: boolean;
  source_app_id: string;
  target_app_id: string;
  description?: string;
  integration_type?: string;
  data_shared?: string;
  documentation_url?: string;
  confidence: number;
  source_type: 'cached' | 'discovery' | 'not_found';
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeName(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Tavily Search — AI-optimized search API, returns up to 10 web results with extracted content
async function tavilySearch(query: string, apiKey: string): Promise<{ url: string; title: string; description: string; content: string }[]> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: 10,
        include_answer: false,
        include_raw_content: false,
      }),
    });
    if (!res.ok) {
      console.error('Tavily search error:', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      url: r.url,
      title: r.title || '',
      description: r.content || '',
      content: r.content || '',
    }));
  } catch (e) {
    console.error('Tavily search exception:', e);
    return [];
  }
}

// Fetch a page and extract text content
async function fetchPage(url: string): Promise<{ ok: boolean; text: string; status: number }> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackSeam/1.0; +https://stackseam.tech)' },
      signal: c.signal,
      redirect: 'follow',
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, text: '', status: res.status };
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { ok: true, text, status: res.status };
  } catch {
    return { ok: false, text: '', status: 0 };
  }
}

// Two-stage verification: HEAD first (fast), then GET with content check
async function verifyUrl(url: string, sourceName: string, targetName: string): Promise<{ valid: boolean; confidence: number; text: string }> {
  // Stage 1: HEAD check
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    const head = await fetch(url, { method: 'HEAD', signal: c.signal, redirect: 'follow' });
    clearTimeout(t);
    if (!head.ok && head.status !== 405) {
      return { valid: false, confidence: 0, text: '' };
    }
  } catch {
    // Some servers reject HEAD; fall through to GET
  }

  // Stage 2: GET + content check
  const page = await fetchPage(url);
  if (!page.ok) return { valid: false, confidence: 0, text: '' };

  const lowerText = page.text.toLowerCase();
  const sourceNorm = normalizeName(sourceName);
  const targetNorm = normalizeName(targetName);

  // Build keywords for each app (compact + spaced versions)
  const sourceKeys = [sourceName.toLowerCase(), sourceNorm].filter(k => k.length > 2);
  const targetKeys = [targetName.toLowerCase(), targetNorm].filter(k => k.length > 2);

  const hasSource = sourceKeys.some(k => lowerText.includes(k));
  const hasTarget = targetKeys.some(k => lowerText.includes(k));
  const hasIntegrationKeyword = /integrat|connect|sync|api|webhook|partner/i.test(page.text.substring(0, 5000));

  if (!hasSource || !hasTarget) {
    return { valid: false, confidence: 0, text: '' };
  }

  // Confidence scoring
  let confidence = 60; // base for both apps mentioned
  if (hasIntegrationKeyword) confidence += 15;

  const domain = extractDomain(url);
  const sourceDomainMatch = domain.includes(sourceNorm.substring(0, 8));
  const targetDomainMatch = domain.includes(targetNorm.substring(0, 8));

  if (sourceDomainMatch || targetDomainMatch) confidence += 20; // on official vendor docs
  if (domain.startsWith('docs.') || domain.startsWith('help.') || domain.startsWith('support.')) confidence += 5;

  return { valid: true, confidence: Math.min(confidence, 100), text: page.text.substring(0, 8000) };
}

// AI extraction of integration details from verified page text
async function extractIntegrationDetails(
  sourceName: string,
  targetName: string,
  pageText: string,
  pageUrl: string,
  openaiKey: string
): Promise<{ description: string; integration_type: string; data_shared: string } | null> {
  const prompt = `Extract integration details between "${sourceName}" and "${targetName}" from this verified documentation page.

Page URL: ${pageUrl}
Page content:
${pageText}

Provide a brief, factual extraction. Only describe what is explicitly mentioned in the content above. Do not invent features.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You extract structured integration data from documentation. Be concise and factual. Never invent features not mentioned in the source text.' },
          { role: 'user', content: prompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'extract_integration',
            description: 'Extract structured integration details',
            parameters: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'One-sentence description of what the integration does' },
                integration_type: { type: 'string', enum: ['native', 'api', 'zapier', 'webhook', 'oauth', 'plugin', 'other'] },
                data_shared: { type: 'string', description: 'What data flows between the two apps (e.g. "tickets, alerts, devices")' },
              },
              required: ['description', 'integration_type', 'data_shared'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'extract_integration' } },
      }),
    });

    if (!res.ok) {
      console.error('OpenAI extraction error:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return null;
    return JSON.parse(toolCall.function.arguments);
  } catch (e) {
    console.error('Extraction exception:', e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const tavilyKey = Deno.env.get('TAVILY_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    if (!tavilyKey) {
      return new Response(JSON.stringify({ error: 'TAVILY_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { source_app_id, target_app_id, force_refresh } = body;

    if (!source_app_id || !target_app_id) {
      return new Response(JSON.stringify({ error: 'source_app_id and target_app_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Load app names
    const { data: apps, error: appsErr } = await supabase
      .from('applications')
      .select('id, name')
      .in('id', [source_app_id, target_app_id]);

    if (appsErr || !apps || apps.length !== 2) {
      return new Response(JSON.stringify({ error: 'Apps not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sourceApp = apps.find(a => a.id === source_app_id)!;
    const targetApp = apps.find(a => a.id === target_app_id)!;

    // Check cache
    if (!force_refresh) {
      const { data: cached } = await supabase
        .from('discovery_cache')
        .select('*')
        .or(`and(source_app_id.eq.${source_app_id},target_app_id.eq.${target_app_id}),and(source_app_id.eq.${target_app_id},target_app_id.eq.${source_app_id})`)
        .gte('scanned_at', new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString())
        .maybeSingle();

      if (cached) {
        return new Response(JSON.stringify({
          ...cached.metadata,
          source_type: 'cached',
          source_app_id,
          target_app_id,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Brave Search
    const query = `"${sourceApp.name}" "${targetApp.name}" integration`;
    const searchResults = await tavilySearch(query, tavilyKey);

    if (searchResults.length === 0) {
      // Cache the negative result
      await supabase.from('discovery_cache').upsert({
        source_app_id, target_app_id,
        result_status: 'not_found',
        metadata: { found: false, confidence: 0 },
        scanned_at: new Date().toISOString(),
      }, { onConflict: 'source_app_id,target_app_id' });

      return new Response(JSON.stringify({
        found: false, source_type: 'not_found',
        source_app_id, target_app_id, confidence: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify top results in parallel (max 3)
    const topResults = searchResults.slice(0, 5);
    const verified = await Promise.all(
      topResults.map(async r => ({
        ...r,
        verification: await verifyUrl(r.url, sourceApp.name, targetApp.name),
      }))
    );

    // Pick the highest confidence verified result
    const validResults = verified.filter(v => v.verification.valid).sort((a, b) => b.verification.confidence - a.verification.confidence);

    if (validResults.length === 0) {
      await supabase.from('discovery_cache').upsert({
        source_app_id, target_app_id,
        result_status: 'not_found',
        metadata: { found: false, confidence: 0, candidates_checked: topResults.length },
        scanned_at: new Date().toISOString(),
      }, { onConflict: 'source_app_id,target_app_id' });

      return new Response(JSON.stringify({
        found: false, source_type: 'not_found',
        source_app_id, target_app_id, confidence: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const best = validResults[0];

    // AI extraction of details
    const details = await extractIntegrationDetails(
      sourceApp.name, targetApp.name, best.verification.text, best.url, openaiKey
    );

    const result: PairResult = {
      found: true,
      source_app_id,
      target_app_id,
      description: details?.description || best.description,
      integration_type: details?.integration_type || 'other',
      data_shared: details?.data_shared || '',
      documentation_url: best.url,
      confidence: best.verification.confidence,
      source_type: 'discovery',
    };

    // Cache the positive result
    await supabase.from('discovery_cache').upsert({
      source_app_id, target_app_id,
      result_status: 'found',
      metadata: result,
      scanned_at: new Date().toISOString(),
    }, { onConflict: 'source_app_id,target_app_id' });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('discover-pair error:', e);
    return new Response(JSON.stringify({ error: e.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
