// discover-pair: discovers integrations between exactly 2 apps
// Strategy: Brave Search for real URLs → fetch + verify content → AI structured extraction
// Returns confidence-scored result, caches outcome to avoid re-scanning

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

// OpenAI web search: uses gpt-4o-mini-search-preview (a model with built-in
// browsing) to find real integration docs URLs. Returns real citations via
// `url_citation` annotations, plus the model's own response text as a fallback
// pageText for verification when fetchPage gets bot-blocked.
//
// Throws on HTTP errors so the caller can distinguish "search failed" (hard
// failure — don't cache) from "search returned no results" (cache not_found).
interface SearchResult { url: string; title: string; description: string; content: string; }

async function openaiWebSearch(
  sourceName: string,
  targetName: string,
  sourceDomains: Set<string>,
  targetDomains: Set<string>,
  apiKey: string,
): Promise<SearchResult[]> {
  const allowedDomains = Array.from(new Set([...sourceDomains, ...targetDomains])).join(', ');
  const prompt = `Find any official page on the vendor's own website that describes how "${sourceName}" and "${targetName}" work together as an integration.

Rules:
- The URL MUST be hosted on one of these domains (or a subdomain): ${allowedDomains}
- Acceptable page types: product integration page, marketplace/app store listing, marketing page for the specific integration, help center article, API reference, setup guide, connector page, partner integration page. Marketing-style product pages count — if the vendor has a page at /integrations/{other-app} or similar, return it.
- Reject only: privacy policies, subprocessor lists, legal/terms pages, GDPR/compliance pages, blog posts, press releases, third-party review sites, consultant blogs.
- Return up to 5 candidate URLs. Be permissive — downstream verification will filter false positives. It is better to return a borderline candidate than to return nothing.
- If the vendor clearly has no page at all describing this integration, return nothing.

For each URL you return, quote a verbatim excerpt (150+ words if available) from the page that mentions both app names in the context of an integration, connector, sync, or data flow.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-search-preview',
      web_search_options: {},
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('OpenAI search error:', res.status, errText.slice(0, 500));
    throw new Error(`openai_search_failed_${res.status}`);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  const content: string = msg?.content || '';
  const annotations: any[] = msg?.annotations || [];

  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const a of annotations) {
    if (a.type !== 'url_citation') continue;
    const url = a.url_citation?.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    results.push({
      url,
      title: a.url_citation?.title || '',
      description: '',
      content: content.slice(0, 12000),
    });
  }
  // If the model returned no citations, log its reasoning so we can see whether
  // it hallucinated a "nothing found" verdict on a vendor that clearly has
  // integration pages (Blackpoint-style false negative).
  if (results.length === 0) {
    console.log(`[discover-pair] zero citations for ${sourceName} + ${targetName}. model said:`, content.slice(0, 1500));
  }
  return results;
}

// Detect Cloudflare / bot-challenge pages
function isChallengePage(html: string): boolean {
  const sample = html.substring(0, 3000).toLowerCase();
  return (
    sample.includes('attention required') ||
    sample.includes('cloudflare') && sample.includes('challenge') ||
    sample.includes('you have been blocked') ||
    sample.includes('cf-browser-verification') ||
    sample.includes('just a moment') ||
    sample.includes('ddos protection') ||
    sample.includes('please enable cookies')
  );
}

// Browser-like headers to avoid trivial bot blocks
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
};

// Fetch a page and extract text content. Returns challenge=true if a bot wall was detected.
async function fetchPage(url: string): Promise<{ ok: boolean; text: string; status: number; challenge: boolean }> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: c.signal,
      redirect: 'follow',
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, text: '', status: res.status, challenge: false };
    const html = await res.text();
    if (isChallengePage(html)) {
      return { ok: false, text: '', status: res.status, challenge: true };
    }
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { ok: true, text, status: res.status, challenge: false };
  } catch {
    return { ok: false, text: '', status: 0, challenge: false };
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

// URL paths that are usually NOT integration docs
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
  // Legal / compliance / trust pages — these list subprocessors, not integrations
  /\/sub[-_]?processor/i,
  /\/privacy/i,
  /\/gdpr/i,
  /\/ccpa/i,
  /\/hipaa/i,
  /\/security/i,
  /\/trust/i,
  /\/legal/i,
  /\/terms/i,
  /\/tos\b/i,
  /\/dpa\b/i,
  /\/data[-_]?processing/i,
  /\/cookies?/i,
  /\/policy/i,
  /\/policies/i,
  /\/compliance/i,
  /\/vendor[-_]?list/i,
  /\/partners?\/?$/i,  // generic partners directory (not /partners/specific-app)
];

function isRejectPath(url: string): boolean {
  try {
    const u = new URL(url);
    return REJECT_PATH_PATTERNS.some(p => p.test(u.pathname));
  } catch {
    return false;
  }
}

// Escape a string for use inside a RegExp
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a word-boundary regex for a keyword. Uses lookarounds so matches like
// "Meshed360" don't hit when searching for "Mesh", and "Checkeeper" doesn't hit
// when searching for "Keeper". The lookarounds treat non-word chars and end/start
// of string as valid boundaries.
function wordBoundaryRegex(keyword: string, flags = 'gi'): RegExp {
  const esc = escapeRegex(keyword);
  // (?<![\w]) negative lookbehind, (?![\w]) negative lookahead
  return new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, flags);
}

// Count occurrences of any keyword in text, matching whole words only.
function countOccurrences(text: string, keywords: string[]): number {
  let count = 0;
  for (const kw of keywords) {
    if (kw.length < 3) continue;
    const matches = text.match(wordBoundaryRegex(kw));
    if (matches) count += matches.length;
  }
  return count;
}

// Collect all whole-word positions of any keyword in the text
function findPositions(text: string, keywords: string[]): number[] {
  const positions: number[] = [];
  for (const kw of keywords) {
    if (kw.length < 3) continue;
    const rx = wordBoundaryRegex(kw);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      positions.push(m.index);
    }
  }
  return positions.sort((a, b) => a - b);
}

// Find the closest distance (in chars) between any source keyword and any target keyword,
// using whole-word matching so substring collisions don't count.
function minProximity(text: string, sourceKeys: string[], targetKeys: string[]): number {
  const sPositions = findPositions(text, sourceKeys);
  const tPositions = findPositions(text, targetKeys);
  if (sPositions.length === 0 || tPositions.length === 0) return Infinity;
  let minDist = Infinity;
  for (const s of sPositions) {
    for (const t of tPositions) {
      const d = Math.abs(t - s);
      if (d < minDist) minDist = d;
      if (d === 0) return 0;
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
  fallbackContent?: string,  // pre-extracted content from Tavily, used if fetch gets blocked
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

  // 3. Get page text. Strategy: fetch the URL AND merge with fallbackContent
  // (the search model's verbatim excerpt). Merging is critical for JS-rendered
  // SPAs — e.g. blackpointcyber.com/integrations/ ships a near-empty HTML shell
  // that passes the length check but contains zero integration data. The
  // search model browses with JS enabled so its excerpt has the real content.
  // Combining the two covers both static sites and SPAs without breaking either.
  let pageText = '';
  const page = await fetchPage(url);
  if (page.ok && page.text.length > 200) {
    pageText = page.text;
  }
  if (fallbackContent && fallbackContent.length > 200) {
    pageText = pageText ? `${pageText}\n\n---\n\n${fallbackContent}` : fallbackContent;
  }
  if (pageText.length < 200) {
    return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: page.challenge ? 'bot_challenge' : 'fetch_failed' };
  }

  const sourceNorm = normalizeName(sourceName);
  const targetNorm = normalizeName(targetName);
  const sourceKeys = [sourceName.toLowerCase(), sourceNorm].filter(k => k.length > 2);
  const targetKeys = [targetName.toLowerCase(), targetNorm].filter(k => k.length > 2);

  // Determine which app is the "other" (not the domain owner)
  // Pages on vendor domains naturally mention themselves a lot, so we check the OTHER app
  const otherKeys = ownedBySource ? targetKeys : sourceKeys;
  const ownerKeys = ownedBySource ? sourceKeys : targetKeys;

  const otherCount = countOccurrences(pageText, otherKeys);
  const ownerCount = countOccurrences(pageText, ownerKeys);

  // 5. Require the OTHER app to be mentioned at least twice
  if (otherCount < 2) {
    return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: `other_mentioned_only_${otherCount}_times` };
  }
  if (ownerCount < 1) {
    return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: 'owner_not_mentioned' };
  }

  // 6. Require integration keyword to appear near the other app name
  const proximity = minProximity(pageText, sourceKeys, targetKeys);
  if (proximity > 500) {
    return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: `proximity_${proximity}` };
  }

  // 7. Integration keyword must appear near the app names (not just anywhere on page).
  // Build a window around each word-boundary occurrence and check inside it.
  const integrationRegex = /integrat|\bsync\b|api integration|webhook|two-way|bidirectional|connector|workflow|automat/i;
  const allKeys = [...sourceKeys, ...targetKeys];
  const mentionPositions = findPositions(pageText, allKeys);
  let keywordNearMention = false;
  for (const idx of mentionPositions) {
    const start = Math.max(0, idx - 300);
    const end = Math.min(pageText.length, idx + 300);
    if (integrationRegex.test(pageText.substring(start, end))) {
      keywordNearMention = true;
      break;
    }
  }

  if (!keywordNearMention) {
    return { valid: false, confidence: 0, text: '', ownerSide: null, rejectReason: 'no_integration_keyword_near_mention' };
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
    text: pageText.substring(0, 8000),
    ownerSide: ownedBySource ? 'source' : 'target',
  };
}

interface AppContext {
  name: string;
  description?: string | null;
  vendor_url?: string | null;
  category?: string | null;
}

/// AI gate: final yes/no check that this page actually describes an integration
async function aiGateCheck(
  sourceApp: AppContext,
  targetApp: AppContext,
  pageText: string,
  pageUrl: string,
  openaiKey: string,
): Promise<{ isIntegration: boolean; reason: string }> {
  const sourceName = sourceApp.name;
  const targetName = targetApp.name;

  // Distributor special case: any app in the "Distributors" category (Pax8,
  // TD SYNNEX, Ingram Micro, D&H, AppDirect, etc.) is a software reseller /
  // marketplace. Marketplace listings naturally name both apps but describe
  // a channel/reseller relationship, not a product integration. Tighten the
  // gate so only pages describing real technical data flow pass.
  const involvesDistributor = sourceApp.category === 'Distributors' || targetApp.category === 'Distributors';
  const distributorName = sourceApp.category === 'Distributors' ? sourceName : targetName;
  const distributorRule = involvesDistributor
    ? `\n\nDISTRIBUTOR RULE (CRITICAL): ${distributorName} is a software distributor / marketplace. REJECT any page that merely says the other app is "available via", "sold on", "listed in", "purchasable through", "part of the catalog of", "offered through", or "a vendor on" ${distributorName}. That describes a channel / reseller relationship, NOT a product integration. ACCEPT only when the page explicitly describes a TECHNICAL product integration with real data flow between the two products — API sync of license counts, automated provisioning, webhook billing events, usage reporting pulled into another app, license events pushed via API, etc. Marketplace listings, product catalog entries, vendor directory pages, and "available on ${distributorName}" announcements must be REJECTED.`
    : '';

  const appContext = `
IMPORTANT — these are the SPECIFIC products. Do not confuse them with generic terms or similarly-named products:

App 1: "${sourceName}"
  Category: ${sourceApp.category || 'unknown'}
  Vendor URL: ${sourceApp.vendor_url || 'unknown'}
  Description: ${sourceApp.description || '(none)'}

App 2: "${targetName}"
  Category: ${targetApp.category || 'unknown'}
  Vendor URL: ${targetApp.vendor_url || 'unknown'}
  Description: ${targetApp.description || '(none)'}

If the page appears to be about different products that share a name (e.g., "Mesh" the email security company vs. mesh networking; "Datto" the backup company vs. an unrelated entity), REJECT it.${distributorRule}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You verify whether a documentation page actually describes a WORKING TECHNICAL SOFTWARE INTEGRATION between two named applications.

REJECT the page if it is any of:
- A subprocessor / vendor list / GDPR / privacy policy / DPA (lists a company as a service provider, not an integration)
- A "trust center", compliance page, legal page, or terms of service
- A blog post, release notes, changelog, news, or press release
- A partner directory or comparison/vs page
- A case study, testimonial, or customer story
- A page where one app is only mentioned incidentally (e.g., "built on X" or "hosted by X")
- A page listing business/operational services (billing provider, hosting provider, analytics provider) rather than product integrations

ACCEPT only if the page clearly describes how to connect or technically integrate the two specific applications as a product feature — e.g., setup instructions, API docs, sync details, native integration description, webhook configuration, OAuth flow, marketplace listing for that specific integration pair.

Being on the vendor's domain does NOT automatically mean it's an integration page.`,
          },
          {
            role: 'user',
            content: `Does this page describe an actual working product-level integration between "${sourceName}" and "${targetName}"?
${appContext}

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
                is_integration: { type: 'boolean', description: 'true ONLY if this page describes how to connect or use a real product integration between the two SPECIFIC named apps (matching their descriptions and categories). FALSE if it is a subprocessor list, privacy/legal page, blog, release notes, comparison, only mentions one app as a vendor/service provider, OR if the page is about a DIFFERENT product that merely shares a name with one of the apps (e.g., "mesh networking" vs "Mesh Security").' },
                page_type: { type: 'string', enum: ['integration_docs', 'marketplace_listing', 'api_reference', 'subprocessor_list', 'privacy_legal', 'blog_news', 'partner_directory', 'incidental_mention', 'name_collision', 'other'], description: 'Classify the page type' },
                reason: { type: 'string', description: 'Brief reason for the decision' },
              },
              required: ['is_integration', 'page_type', 'reason'],
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { source_app_id, target_app_id, force_refresh } = body;

    if (!source_app_id || !target_app_id) {
      return new Response(JSON.stringify({ error: 'source_app_id and target_app_id required' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Load app context (name, domains, description, category) for both apps
    const { data: apps, error: appsErr } = await supabase
      .from('applications')
      .select('id, name, vendor_url, alias_domains, description, categories(name)')
      .in('id', [source_app_id, target_app_id]);

    if (appsErr || !apps || apps.length !== 2) {
      return new Response(JSON.stringify({ error: 'Apps not found' }), {
        status: 404, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const sourceApp = apps.find(a => a.id === source_app_id)! as any;
    const targetApp = apps.find(a => a.id === target_app_id)! as any;
    const sourceDomains = buildAllowedDomains(sourceApp.name, sourceApp.vendor_url, sourceApp.alias_domains || []);
    const targetDomains = buildAllowedDomains(targetApp.name, targetApp.vendor_url, targetApp.alias_domains || []);

    // Check cache. Blacklisted entries never expire; everything else honors CACHE_TTL_DAYS.
    if (!force_refresh) {
      const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from('discovery_cache')
        .select('*')
        .or(`and(source_app_id.eq.${source_app_id},target_app_id.eq.${target_app_id}),and(source_app_id.eq.${target_app_id},target_app_id.eq.${source_app_id})`)
        .or(`result_status.eq.blacklisted,scanned_at.gte.${cutoff}`)
        .maybeSingle();

      if (cached) {
        return new Response(JSON.stringify({
          ...cached.metadata,
          source_type: 'cached',
          source_app_id,
          target_app_id,
        }), { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });
      }
    }

    // OpenAI web search (gpt-4o-mini-search-preview). Replaces Tavily — uses the
    // model's built-in browsing to find real URLs with citation annotations.
    // Any API-level failure (401/429/5xx) throws and bubbles up as a 500, which
    // process-discovery-job treats as a hard job failure instead of silently
    // caching "not_found".
    const searchResults = await openaiWebSearch(
      sourceApp.name, targetApp.name, sourceDomains, targetDomains, openaiKey,
    );
    console.log(`[discover-pair] ${sourceApp.name} + ${targetApp.name} → ${searchResults.length} citations`, searchResults.map(r => r.url));

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
      }), { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // Verify top results in parallel (max 3)
    const topResults = searchResults.slice(0, 5);
    const verified = await Promise.all(
      topResults.map(async r => ({
        ...r,
        verification: await verifyUrl(r.url, sourceApp.name, targetApp.name, sourceDomains, targetDomains, r.content),
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
      }), { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // Run AI gate on top candidates until one passes (max 3)
    let best: typeof validResults[0] | null = null;
    let gateReason = '';
    for (const candidate of validResults.slice(0, 3)) {
      const sourceCtx: AppContext = {
        name: sourceApp.name,
        description: sourceApp.description,
        vendor_url: sourceApp.vendor_url,
        category: (sourceApp as any).categories?.name || null,
      };
      const targetCtx: AppContext = {
        name: targetApp.name,
        description: targetApp.description,
        vendor_url: targetApp.vendor_url,
        category: (targetApp as any).categories?.name || null,
      };
      const gate = await aiGateCheck(sourceCtx, targetCtx, candidate.verification.text, candidate.url, openaiKey);
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
      }), { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });
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
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('discover-pair error:', e);
    const msg = e?.message || 'Unknown error';
    // If the search backend is the one that failed (credit exhaustion, auth, etc),
    // signal that distinctly so the orchestrator can fail the job loudly instead
    // of caching a bogus "not_found".
    const isSearchError = msg.startsWith('openai_search_failed_');
    return new Response(JSON.stringify({ error: msg, search_error: isSearchError }), {
      status: isSearchError ? 503 : 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
