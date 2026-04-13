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

// Build the set of allowed root domains for an app (vendor URL + alias_domains + name-derived guesses)
function buildAllowedDomains(name: string, vendorUrl: string | null, aliasDomains: string[] = []): Set<string> {
  const domains = new Set<string>();
  const addRoot = (raw: string) => {
    const d = extractDomain(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!d) return;
    const parts = d.split('.');
    const root = parts.length >= 2 ? parts.slice(-2).join('.') : d;
    domains.add(root);
  };
  if (vendorUrl) addRoot(vendorUrl);
  for (const alias of aliasDomains || []) addRoot(alias);
  // Name-based guess: e.g. "N-able N-central" → "n-able.com", "ncentral.com"
  const nameNorm = normalizeName(name);
  if (nameNorm.length >= 3) {
    domains.add(`${nameNorm}.com`);
    domains.add(`${nameNorm}.io`);
  }
  // Also include obvious word-based guesses (first token)
  const firstWord = name.toLowerCase().split(/\s|[/-]/)[0].replace(/[^a-z0-9]/g, '');
  if (firstWord.length >= 4) {
    domains.add(`${firstWord}.com`);
  }
  return domains;
}

function isDomainOwnedBy(url: string, allowedDomains: Set<string>): boolean {
  const domain = extractDomain(url);
  if (!domain) return false;
  for (const allowed of allowedDomains) {
    if (domain === allowed || domain.endsWith('.' + allowed)) return true;
  }
  return false;
}

// URL paths that are usually NOT integration docs (release notes, blog posts, etc.)
const REJECT_PATH_PATTERNS = [
  /\/release[-_]?notes?(\b|\/)/i,
  /\/changelog/i,
  /\/whats[-_]?new/i,
  /\/blog\b/i,
  /\/news\b/i,
  /\/press\b/i,
  /\/announcement/i,
  /\/podcast/i,
  /\/webinar/i,
  /\/event/i,
  /\/case[-_]?stud/i,
  /\/comparison/i,
  /\/vs\b/i,
  /\/alternative/i,
  /\/jobs?\b/i,
  /\/careers?\b/i,
  /\/about\b/i,
  /\/team\b/i,
];

function isRejectPath(url: string): boolean {
  try {
    const u = new URL(url);
    return REJECT_PATH_PATTERNS.some(p => p.test(u.pathname));
  } catch {
    return false;
  }
}

// Count occurrences of any keyword from the list in text
function countOccurrences(text: string, keywords: string[]): number {
  let count = 0;
  for (const kw of keywords) {
    if (kw.length < 3) continue;
    const matches = text.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
    if (matches) count += matches.length;
  }
  return count;
}

// Find the closest distance (in chars) between any source keyword and any target keyword
function minProximity(text: string, sourceKeys: string[], targetKeys: string[]): number {
  const lower = text.toLowerCase();
  let minDist = Infinity;
  for (const sk of sourceKeys) {
    if (sk.length < 3) continue;
    let sIdx = lower.indexOf(sk);
    while (sIdx !== -1) {
      for (const tk of targetKeys) {
        if (tk.length < 3) continue;
        // Find nearest target occurrence to this source occurrence
        let tIdx = lower.indexOf(tk);
        while (tIdx !== -1) {
          const dist = Math.abs(tIdx - sIdx);
          if (dist < minDist) minDist = dist;
          if (dist === 0) return 0;
          tIdx = lower.indexOf(tk, tIdx + 1);
        }
      }
      sIdx = lower.indexOf(sk, sIdx + 1);
    }
  }
  return minDist;
}

// Verification: URL MUST be on one of the two apps' official domains, AND
// page content must clearly describe an integration between the two apps.
async function verifyUrl(
  url: string,
  sourceName: string,
  targetName: string,
  sourceDomains: Set<string>,
  targetDomains: Set<string>,
): Promise<{ valid: boolean; confidence: number; text: string; ownerSide: 'source' | 'target' | null; rejectReason?: string }> {
  // 1. Reject URLs not on either app's domain
  const ownedBySource = isDomainOwnedBy(url, sourceDomains);
  const ownedByTarget = isDomainOwnedBy(url, targetDomains);
  if (!ownedBySource && !ownedByTarget) {
    return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: 'wrong_domain' };
  }

  // 2. Reject blog/release-notes/etc URL patterns
  if (isRejectPath(url)) {
    return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: 'reject_path' };
  }

  // 3. HEAD check
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    const head = await fetch(url, { method: 'HEAD', signal: c.signal, redirect: 'follow' });
    clearTimeout(t);
    if (!head.ok && head.status !== 405) {
      return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: 'http_error' };
    }
  } catch {
    // Some servers reject HEAD; fall through to GET
  }

  // 4. GET page content
  const page = await fetchPage(url);
  if (!page.ok) return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: 'fetch_failed' };

  const sourceNorm = normalizeName(sourceName);
  const targetNorm = normalizeName(targetName);
  const sourceKeys = [sourceName.toLowerCase(), sourceNorm].filter(k => k.length > 2);
  const targetKeys = [targetName.toLowerCase(), targetNorm].filter(k => k.length > 2);

  // Determine which app is the "other" (not the domain owner)
  // Pages on vendor domains naturally mention themselves a lot, so we check the OTHER app
  const otherKeys = ownedBySource ? targetKeys : sourceKeys;
  const ownerKeys = ownedBySource ? sourceKeys : targetKeys;

  const otherCount = countOccurrences(page.text, otherKeys);
  const ownerCount = countOccurrences(page.text, ownerKeys);

  // 5. Require the OTHER app to be mentioned at least twice
  if (otherCount < 2) {
    return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: `other_mentioned_only_${otherCount}_times` };
  }
  if (ownerCount < 1) {
    return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: 'owner_not_mentioned' };
  }

  // 6. Require integration keyword to appear near the other app name
  const proximity = minProximity(page.text, sourceKeys, targetKeys);
  if (proximity > 500) {
    return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: `proximity_${proximity}` };
  }

  // 7. Integration-specific keywords
  const hasIntegrationKeyword = /integrat|connect|sync|api integration|webhook|two-way|bidirectional/i.test(page.text);
  if (!hasIntegrationKeyword) {
    return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: 'no_integration_keyword' };
  }

  // Confidence scoring
  let confidence = 75;
  const domain = extractDomain(url);
  if (domain.startsWith('docs.') || domain.startsWith('help.') || domain.startsWith('support.') || domain.startsWith('kb.') || domain.startsWith('integrations.')) {
    confidence += 15;
  } else {
    confidence += 5;
  }
  if (otherCount >= 5) confidence += 5;
  if (proximity < 100) confidence += 5;

  return {
    valid: true,
    confidence: Math.min(confidence, 100),
    text: page.text.substring(0, 8000),
    ownerSide: ownedBySource ? 'source' : 'target',
  };
}

// AI gate: final yes/no check that this page actually describes an integration
async function aiGateCheck(
  sourceName: string,
  targetName: string,
  pageText: string,
  pageUrl: string,
  openaiKey: string,
): Promise<{ isIntegration: boolean; reason: string }> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You verify whether a documentation page actually describes a working software integration between two named applications. Reject pages that are blogs, release notes, partner directories, comparisons, or pages where one app is only mentioned in passing.',
          },
          {
            role: 'user',
            content: `Does this page describe an actual working integration between "${sourceName}" and "${targetName}"?

URL: ${pageUrl}
Content:
${pageText.substring(0, 4000)}

Answer with the tool call.`,
          },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'verify',
            parameters: {
              type: 'object',
              properties: {
                is_integration: { type: 'boolean', description: 'true ONLY if this page describes a real integration between the two apps. False if it is a release note, blog, comparison, or only mentions one app in passing.' },
                reason: { type: 'string', description: 'Brief reason for the decision' },
              },
              required: ['is_integration', 'reason'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'verify' } },
      }),
    });
    if (!res.ok) return { isIntegration: false, reason: 'ai_error' };
    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return { isIntegration: false, reason: 'no_tool_call' };
    const parsed = JSON.parse(toolCall.function.arguments);
    return { isIntegration: !!parsed.is_integration, reason: parsed.reason || '' };
  } catch (e) {
    console.error('AI gate error:', e);
    return { isIntegration: false, reason: 'exception' };
  }
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
      .select('id, name, vendor_url, alias_domains')
      .in('id', [source_app_id, target_app_id]);

    if (appsErr || !apps || apps.length !== 2) {
      return new Response(JSON.stringify({ error: 'Apps not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sourceApp = apps.find(a => a.id === source_app_id)! as any;
    const targetApp = apps.find(a => a.id === target_app_id)! as any;
    const sourceDomains = buildAllowedDomains(sourceApp.name, sourceApp.vendor_url, sourceApp.alias_domains || []);
    const targetDomains = buildAllowedDomains(targetApp.name, targetApp.vendor_url, targetApp.alias_domains || []);

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

    // Tavily Search — try both directions to find docs on either vendor's domain
    const allDomains = Array.from(new Set([...sourceDomains, ...targetDomains]));
    const siteFilter = allDomains.length > 0 ? ` (${allDomains.map(d => `site:${d}`).join(' OR ')})` : '';
    const query = `"${sourceApp.name}" "${targetApp.name}" integration${siteFilter}`;
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
        verification: await verifyUrl(r.url, sourceApp.name, targetApp.name, sourceDomains, targetDomains),
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

    // Run AI gate on top candidates until one passes (max 3)
    let best: typeof validResults[0] | null = null;
    let gateReason = '';
    for (const candidate of validResults.slice(0, 3)) {
      const gate = await aiGateCheck(sourceApp.name, targetApp.name, candidate.verification.text, candidate.url, openaiKey);
      if (gate.isIntegration) {
        best = candidate;
        break;
      }
      gateReason = gate.reason;
      console.log(`AI gate rejected ${candidate.url}: ${gate.reason}`);
    }

    if (!best) {
      await supabase.from('discovery_cache').upsert({
        source_app_id, target_app_id,
        result_status: 'not_found',
        metadata: { found: false, confidence: 0, ai_gate_rejected: gateReason },
        scanned_at: new Date().toISOString(),
      }, { onConflict: 'source_app_id,target_app_id' });

      return new Response(JSON.stringify({
        found: false, source_type: 'not_found',
        source_app_id, target_app_id, confidence: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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
