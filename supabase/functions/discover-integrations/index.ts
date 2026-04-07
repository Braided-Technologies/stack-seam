import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeName(name: string | undefined | null): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const APP_ALIASES: Record<string, string[]> = {
  halopsa: ['halo psa'],
  ncentral: ['n-central', 'n central', 'n-able n-central', 'n-able n central', 'nable n-central', 'nable n central', 'nable ncentral'],
  connectwisemanage: ['connectwise manage'],
  amazonwebservicesaws: ['aws'],
  chatgpt: ['chat gpt'],
};

function buildLookupKeys(name: string | undefined | null): string[] {
  const lower = (name || '').toLowerCase().trim();
  if (!lower) return [];

  const withoutParens = lower.replace(/\(([^)]+)\)/g, ' $1 ');
  const spaced = withoutParens.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const compact = spaced.replace(/\s+/g, '');
  const hyphenated = spaced.replace(/\s+/g, '-');

  const keys = new Set<string>([lower, spaced, compact, hyphenated].filter(Boolean));
  for (const alias of APP_ALIASES[compact] || []) {
    keys.add(alias);
    keys.add(alias.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim());
    keys.add(alias.replace(/[^a-z0-9]/g, ''));
  }

  const parenMatches = Array.from(lower.matchAll(/\(([^)]+)\)/g));
  for (const match of parenMatches) {
    const token = match[1]?.trim().toLowerCase();
    if (!token) continue;
    keys.add(token);
    keys.add(token.replace(/[^a-z0-9]/g, ''));
  }

  return [...keys].filter(Boolean);
}

function namesMatch(left: string | undefined | null, right: string | undefined | null): boolean {
  const leftKeys = new Set(buildLookupKeys(left));
  return buildLookupKeys(right).some(key => leftKeys.has(key));
}

function getMappedValue<T>(map: Map<string, T>, name: string | undefined | null): T | undefined {
  for (const key of buildLookupKeys(name)) {
    const value = map.get(key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function isDomainMatch(docUrl: string, appDomains: string[]): boolean {
  const docDomain = extractDomain(docUrl);
  if (!docDomain) return false;
  return appDomains.some(d => docDomain === d || docDomain.endsWith('.' + d));
}

function isValidDocUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length < 10) return false;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  if (trimmed.includes('example.com') || trimmed.includes('placeholder') || trimmed.includes('your-')) return false;
  return true;
}

// Check if the URL path is specific enough (not just /integrations or /partners)
function isGenericIntegrationsPage(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '').toLowerCase();
    const genericPaths = ['/integrations', '/partners', '/marketplace', '/connect', '/connectors', '/apps'];
    return genericPaths.includes(path);
  } catch {
    return false;
  }
}

async function verifyUrlWithContent(url: string, sourceName: string, targetName: string): Promise<boolean> {
  try {
    // First check if URL is alive
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackSeam/1.0)' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (res.status < 200 || res.status >= 400) return false;

    const html = await res.text();
    if (html.length < 200) return false;

    // Strip HTML tags for text analysis
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    // If it's a generic integrations page, reject it — we need a specific page
    if (isGenericIntegrationsPage(url)) {
      console.log(`GENERIC_PAGE: ${url} is a generic integrations listing`);
      return false;
    }

    // Check that the page content mentions the OTHER app (the one whose domain the URL is NOT on)
    const urlDomain = extractDomain(url);
    const sourceNorm = normalizeName(sourceName);
    const targetNorm = normalizeName(targetName);

    // Figure out which app this URL belongs to, and check for the OTHER app's name
    const sourceInDomain = urlDomain.includes(sourceNorm) || sourceNorm.includes(urlDomain.split('.')[0]);
    const targetInDomain = urlDomain.includes(targetNorm) || targetNorm.includes(urlDomain.split('.')[0]);

    // The "other" app is the one NOT in the domain
    let otherAppName: string;
    if (sourceInDomain && !targetInDomain) {
      otherAppName = targetName;
    } else if (targetInDomain && !sourceInDomain) {
      otherAppName = sourceName;
    } else {
      // Can't determine ownership, check for both
      otherAppName = targetName; // default check
    }

    // Build search terms for the other app
    const searchTerms = buildSearchTerms(otherAppName);
    const found = searchTerms.some(term => text.includes(term.toLowerCase()));

    if (!found) {
      console.log(`CONTENT_MISS: ${url} does not mention "${otherAppName}" (searched: ${searchTerms.join(', ')})`);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function buildSearchTerms(appName: string): string[] {
  return buildLookupKeys(appName);
}

// Try to scrape vendor's integrations page for real content
async function scrapeVendorIntegrationsPage(vendorUrl: string, _appName: string): Promise<string | null> {
  const domain = extractDomain(vendorUrl);
  if (!domain) return null;

  const paths = ['/integrations', '/partners', '/marketplace'];
  const bases = [`https://${domain}`, `https://docs.${domain}`, `https://help.${domain}`, `https://support.${domain}`];

  const urls = bases.flatMap(b => paths.map(p => `${b}${p}`));
  const pageResults = await Promise.all(urls.map(u => tryFetchPage(u)));
  for (let i = 0; i < pageResults.length; i++) {
    if (pageResults[i]) { console.log(`SCRAPED: ${urls[i]}`); return pageResults[i]; }
  }

  const sitemapResults = await Promise.all(bases.map(b => trySitemapDiscovery(b)));
  for (let i = 0; i < sitemapResults.length; i++) {
    if (sitemapResults[i]) { console.log(`SCRAPED (sitemap): ${bases[i]}`); return sitemapResults[i]; }
  }
  return null;
}

async function trySitemapDiscovery(baseUrl: string): Promise<string | null> {
  for (const path of ['/sitemap.xml', '/sitemap-pages.xml']) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 5000);
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackSeam/1.0)' },
        signal: c.signal, redirect: 'follow',
      });
      clearTimeout(t);
      if (res.status < 200 || res.status >= 400) continue;
      const xml = await res.text();

      const nestedRegex = /<loc>(https?:\/\/[^<]+sitemap[^<]*\.xml)<\/loc>/gi;
      let nested;
      while ((nested = nestedRegex.exec(xml)) !== null) {
        try {
          const c2 = new AbortController();
          const t2 = setTimeout(() => c2.abort(), 5000);
          const r2 = await fetch(nested[1], {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackSeam/1.0)' },
            signal: c2.signal, redirect: 'follow',
          });
          clearTimeout(t2);
          if (r2.ok) {
            const innerXml = await r2.text();
            const urls = extractSitemapIntegrationUrls(innerXml);
            if (urls.length > 0) {
              return `Source: ${baseUrl} (sitemap)\n\nReal integration page URLs:\n${urls.join('\n')}`;
            }
          }
        } catch { /* skip */ }
      }

      const urls = extractSitemapIntegrationUrls(xml);
      if (urls.length > 0) {
        return `Source: ${baseUrl} (sitemap)\n\nReal integration page URLs:\n${urls.join('\n')}`;
      }
    } catch { /* continue */ }
  }
  return null;
}

function extractSitemapIntegrationUrls(xml: string): string[] {
  const regex = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
  const urls: string[] = [];
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const u = m[1].toLowerCase();
    if (u.includes('integration') || u.includes('partner') || u.includes('connector') || u.includes('marketplace')) {
      urls.push(m[1]);
    }
  }
  return urls;
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const absRegex = /href="(https?:\/\/[^"]+)"/gi;
  const relRegex = /href="(\/[^"]+)"/gi;
  let match;
  while ((match = absRegex.exec(html)) !== null) links.push(match[1]);
  while ((match = relRegex.exec(html)) !== null) {
    try { links.push(new URL(match[1], baseUrl).href); } catch { /* skip */ }
  }
  return [...new Set(links)];
}

async function tryFetchPage(url: string): Promise<string | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackSeam/1.0)' },
      signal: c.signal, redirect: 'follow',
    });
    clearTimeout(t);
    if (res.status < 200 || res.status >= 400) return null;
    const html = await res.text();
    if (html.length < 500) return null;

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    const allLinks = extractLinks(html, url);
    const relevantLinks = allLinks.filter(l =>
      l.includes('integration') || l.includes('partner') || l.includes('connect') ||
      l.includes('marketplace') || l.includes('doc') || l.includes('guide')
    ).slice(0, 50);

    return `Source: ${url}\nContent: ${text}\n\nRelevant links found:\n${relevantLinks.join('\n')}`;
  } catch {
    return null;
  }
}

async function discoverBatch(
  appNames: string[],
  LOVABLE_API_KEY: string,
  vendorUrls: Map<string, string>,
  focusApp?: string
) {
  let scrapedContent = '';
  if (focusApp) {
    const vendorUrl = getMappedValue(vendorUrls, focusApp);
    if (vendorUrl) {
      const content = await scrapeVendorIntegrationsPage(vendorUrl, focusApp);
      if (content) {
        scrapedContent = `\n\nSCRAPED VENDOR PAGE DATA for ${focusApp}:\n${content}\n\nIMPORTANT: Use the URLs found in the scraped data above as documentation_url values. These are REAL, verified URLs from the vendor's website. Prefer these over any URLs from your training data.`;
      }
    }
  }

  const appList = appNames.join(", ");
  const focusInstruction = focusApp
    ? `\n\nFOCUS APP: ${focusApp}\nOnly return integrations where either the source or target is ${focusApp}. Ignore any integrations that do not involve ${focusApp}.`
    : '';

  const prompt = `You are an expert on MSP/IT software integrations. Given these tools: ${appList}${focusInstruction}

${focusApp
    ? `List ALL known integrations between ${focusApp} and the other provided tools.`
    : `List ALL known integrations between ANY pair of these tools.`}
Be thorough — include:
- Native/built-in integrations
- API-based integrations
- Integrations through platforms like Zapier, Power Automate, etc.
- PSA/RMM integrations
- Vendor marketplace integrations
${scrapedContent}

CRITICAL RULES:
1. Only include integrations where a SPECIFIC documentation page or KB article exists for that EXACT integration pair.
2. The documentation_url MUST be a SPECIFIC page about that particular integration — NOT a generic /integrations or /marketplace listing page.
3. For example, "https://vendor.com/integrations" is NOT acceptable. "https://vendor.com/integrations/partner-name" IS acceptable.
4. If scraped vendor page data is provided above, USE THOSE URLs — but only specific sub-pages, not the root listing.
5. The documentation_url MUST be from one of the two integration partners' official domains.
6. Do NOT fabricate or guess URLs. If you're not certain a specific integration page exists, do NOT include it.
7. Do NOT include integrations where the only evidence is a generic integrations directory page.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: focusApp
            ? `You are an MSP/IT integration expert. Only report integrations involving ${focusApp}. Each integration MUST have a specific documentation page URL — not a generic listing page. If you cannot find a specific page for an integration, omit it entirely.`
            : "You are an MSP/IT integration expert. Each integration MUST have a specific documentation page URL — not a generic listing page.",
        },
        { role: "user", content: prompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "report_integrations",
          description: "Report discovered integrations. Each must have a specific documentation URL for that exact integration pair.",
          parameters: {
            type: "object",
            properties: {
              integrations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    source: { type: "string" },
                    target: { type: "string" },
                    description: { type: "string" },
                    integration_type: { type: "string", enum: ["native", "api", "zapier", "webhook", "other"] },
                    data_shared: { type: "string" },
                    documentation_url: { type: "string", description: "A SPECIFIC page URL about this exact integration pair. Must NOT be a generic /integrations listing." },
                  },
                  required: ["source", "target", "description", "integration_type", "data_shared", "documentation_url"],
                  additionalProperties: false,
                },
              },
            },
            required: ["integrations"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "report_integrations" } },
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new Error("RATE_LIMITED");
    if (status === 402) throw new Error("CREDITS_EXHAUSTED");
    const t = await response.text();
    console.error("AI gateway error:", status, t);
    throw new Error("AI gateway error");
  }

  const aiData = await response.json();
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return [];

  const parsed = JSON.parse(toolCall.function.arguments);
  const integrations = parsed.integrations || [];

  // Filter out invalid URLs and generic pages upfront
  const candidates = integrations.filter((i: any) => {
    if (!isValidDocUrl(i.documentation_url)) return false;
    if (isGenericIntegrationsPage(i.documentation_url)) {
      console.log(`GENERIC_REJECT: ${i.source} -> ${i.target}: ${i.documentation_url}`);
      return false;
    }
    return true;
  });

  console.log(`Verifying ${candidates.length} candidate URLs with content check...`);
  const verified: any[] = [];

  for (let i = 0; i < candidates.length; i += 5) {
    const batch = candidates.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (integ: any) => {
        const ok = await verifyUrlWithContent(integ.documentation_url, integ.source, integ.target);
        if (!ok) {
          console.log(`REJECTED: ${integ.source} -> ${integ.target}: ${integ.documentation_url}`);
        }
        return { integ, ok };
      })
    );
    for (const { integ, ok } of results) {
      if (ok) verified.push(integ);
    }
  }

  const normalizedFocusApp = normalizeName(focusApp);
  const focusFiltered = normalizedFocusApp
    ? verified.filter((integ: any) => normalizeName(integ.source) === normalizedFocusApp || normalizeName(integ.target) === normalizedFocusApp)
    : verified;

  console.log(`${focusFiltered.length}/${candidates.length} passed content verification${focusApp ? ` for ${focusApp}` : ''}`);
  return focusFiltered;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { app_names, scheduled, focus_app } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (scheduled) {
      const { data: orgs } = await supabaseAdmin.from("organizations").select("id");
      let totalDiscovered = 0;
      let totalSaved = 0;

      for (const org of orgs || []) {
        const { data: orgApps } = await supabaseAdmin
          .from("user_applications")
          .select("application_id, applications(name, vendor_url)")
          .eq("organization_id", org.id);

        const names = (orgApps || []).map((a: any) => a.applications?.name).filter(Boolean);
        if (names.length < 2) continue;

        try {
          const vendorMap = buildVendorMap(orgApps || []);
          const vendorUrls = buildVendorUrlMap(orgApps || []);
          const result = await processDiscovery(names, LOVABLE_API_KEY, supabaseAdmin, vendorMap, vendorUrls);
          totalDiscovered += result.discovered;
          totalSaved += result.saved;
        } catch (e) {
          console.error(`Discovery failed for org ${org.id}:`, e);
        }

        await new Promise(r => setTimeout(r, 2000));
      }

      return new Response(JSON.stringify({ scheduled: true, totalDiscovered, totalSaved }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!app_names || !Array.isArray(app_names) || app_names.length < 2) {
      return new Response(JSON.stringify({ error: "At least 2 app names required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: allApps } = await supabaseAdmin.from("applications").select("id, name, vendor_url");
    const vendorMap = new Map<string, string[]>();
    const vendorUrls = new Map<string, string>();
    for (const app of allApps || []) {
      const domains: string[] = [];
      if (app.vendor_url) {
        const d = extractDomain(app.vendor_url);
        if (d) domains.push(d);
      for (const key of buildLookupKeys(app.name)) {
        vendorUrls.set(key, app.vendor_url);
      }
      }
      const nameKey = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      domains.push(nameKey + '.com');
      for (const key of buildLookupKeys(app.name)) {
        vendorMap.set(key, domains);
      }
    }

    const result = await processDiscovery(app_names, LOVABLE_API_KEY, supabaseAdmin, vendorMap, vendorUrls, focus_app);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("discover-integrations error:", e);
    if (e.message === "RATE_LIMITED") {
      return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildVendorMap(orgApps: any[]): Map<string, string[]> {
  const vendorMap = new Map<string, string[]>();
  for (const oa of orgApps) {
    const app = oa.applications;
    if (!app) continue;
    const domains: string[] = [];
    if (app.vendor_url) {
      const d = extractDomain(app.vendor_url);
      if (d) domains.push(d);
    }
    const nameKey = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    domains.push(nameKey + '.com');
    for (const key of buildLookupKeys(app.name)) {
      vendorMap.set(key, domains);
    }
  }
  return vendorMap;
}

function buildVendorUrlMap(orgApps: any[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const oa of orgApps) {
    const app = oa.applications;
    if (app?.vendor_url) {
      for (const key of buildLookupKeys(app.name)) {
        map.set(key, app.vendor_url);
      }
    }
  }
  return map;
}

async function processDiscovery(
  appNames: string[],
  apiKey: string,
  supabase: any,
  vendorMap: Map<string, string[]>,
  vendorUrls: Map<string, string>,
  focusApp?: string
) {
  const BATCH_SIZE = 15;
  const allIntegrations: any[] = [];

  if (appNames.length <= BATCH_SIZE) {
    const results = await discoverBatch(appNames, apiKey, vendorUrls, focusApp);
    allIntegrations.push(...results);
  } else {
    for (let i = 0; i < appNames.length; i += BATCH_SIZE - 3) {
      const batch = appNames.slice(i, i + BATCH_SIZE);
      if (batch.length < 2) break;
      try {
        const results = await discoverBatch(batch, apiKey, vendorUrls, focusApp);
        allIntegrations.push(...results);
      } catch (e: any) {
        if (e.message === "RATE_LIMITED") {
          await new Promise(r => setTimeout(r, 3000));
          try {
            const results = await discoverBatch(batch, apiKey, vendorUrls, focusApp);
            allIntegrations.push(...results);
          } catch {
            console.error("Batch failed after retry, skipping");
          }
        } else if (e.message === "CREDITS_EXHAUSTED") {
          throw e;
        }
      }
    }
  }

  const seen = new Set<string>();
  const unique = allIntegrations.filter(i => {
    const key = `${normalizeName(i.source)}|${normalizeName(i.target)}`;
    const revKey = `${normalizeName(i.target)}|${normalizeName(i.source)}`;
    if (seen.has(key) || seen.has(revKey)) return false;
    seen.add(key);
    return true;
  });

  const domainValidated = unique.filter(integ => {
    const sourceDomains = getMappedValue(vendorMap, integ.source) || [];
    const targetDomains = getMappedValue(vendorMap, integ.target) || [];
    const allDomains = [...sourceDomains, ...targetDomains];
    if (allDomains.length === 0) return true;
    const passes = isDomainMatch(integ.documentation_url, allDomains);
    if (!passes) {
      console.log(`DOMAIN_REJECT: ${integ.source} -> ${integ.target}: ${integ.documentation_url} not from ${allDomains.join(', ')}`);
    }
    return passes;
  });

  const normalizedFocusApp = normalizeName(focusApp);
  const focusFiltered = normalizedFocusApp
    ? domainValidated.filter(integ => namesMatch(integ.source, focusApp) || namesMatch(integ.target, focusApp))
    : domainValidated;

  console.log(`${focusFiltered.length}/${unique.length} passed all validation${focusApp ? ` for ${focusApp}` : ''}`);

  const { data: allApps } = await supabase.from("applications").select("id, name");
  const appMap = new Map<string, string>();
  for (const app of allApps || []) {
    for (const key of buildLookupKeys(app.name)) {
      if (!appMap.has(key)) appMap.set(key, app.id);
    }
  }

  let newCount = 0;
  let refreshedCount = 0;
  for (const integ of focusFiltered) {
    const sourceId = getMappedValue(appMap, integ.source);
    const targetId = getMappedValue(appMap, integ.target);
    if (!sourceId || !targetId || sourceId === targetId) continue;

    const [reverseLookup, existingLookup] = await Promise.all([
      supabase
        .from("integrations")
        .select("id")
        .eq("source_app_id", targetId)
        .eq("target_app_id", sourceId)
        .maybeSingle(),
      supabase
        .from("integrations")
        .select("id")
        .eq("source_app_id", sourceId)
        .eq("target_app_id", targetId)
        .maybeSingle(),
    ]);

    if (reverseLookup.error) throw reverseLookup.error;
    if (existingLookup.error) throw existingLookup.error;

    const reverseExists = reverseLookup.data;
    const existingForward = existingLookup.data;

    if (reverseExists) continue;

    const { error } = await supabase
      .from("integrations")
      .upsert({
        source_app_id: sourceId,
        target_app_id: targetId,
        description: integ.description,
        integration_type: integ.integration_type,
        data_shared: integ.data_shared,
        documentation_url: integ.documentation_url,
        link_status: 'verified',
        last_verified: new Date().toISOString(),
      }, { onConflict: "source_app_id,target_app_id" });

    if (!error) {
      if (existingForward) refreshedCount++;
      else newCount++;
    }
  }

  return { discovered: focusFiltered.length, saved: newCount, refreshed: refreshedCount, integrations: focusFiltered };
}
