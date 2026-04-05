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

async function verifyUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackSeam/1.0)' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (res.status >= 200 && res.status < 400) return true;
    if (res.status === 405 || res.status === 403) {
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 8000);
      const res2 = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackSeam/1.0)' },
        signal: controller2.signal,
        redirect: 'follow',
      });
      clearTimeout(timeout2);
      await res2.text();
      return res2.status >= 200 && res2.status < 400;
    }
    return false;
  } catch {
    return false;
  }
}

// Try to scrape vendor's integrations page for real content
async function scrapeVendorIntegrationsPage(vendorUrl: string, appName: string): Promise<string | null> {
  const domain = extractDomain(vendorUrl);
  if (!domain) return null;

  const paths = [
    '/integrations', '/partners', '/ecosystem', '/marketplace', '/apps',
    '/connections', '/plugins', '/extensions',
  ];
  const baseUrls = [
    `https://${domain}`,
    `https://docs.${domain}`,
    `https://help.${domain}`,
    `https://support.${domain}`,
  ];

  // Phase 1: Try common integrations paths
  for (const base of baseUrls) {
    for (const path of paths) {
      const result = await tryFetchPage(`${base}${path}`);
      if (result) {
        console.log(`SCRAPED: ${base}${path}`);
        return result;
      }
    }
  }

  // Phase 2: Check sitemaps for integration-related URLs
  for (const base of baseUrls) {
    const sitemapResult = await trySitemapDiscovery(base, domain);
    if (sitemapResult) {
      console.log(`SCRAPED (via sitemap): ${base}`);
      return sitemapResult;
    }
  }

  // Phase 3: Fetch doc site root and follow integration links
  for (const base of baseUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(base, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackSeam/1.0)' },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeout);
      if (res.status < 200 || res.status >= 400) continue;
      const html = await res.text();
      if (html.length < 500) continue;

      const allLinks = extractLinks(html, base);
      const integrationLinks = allLinks.filter(l =>
        l.toLowerCase().includes('integration') || l.toLowerCase().includes('partner') || l.toLowerCase().includes('connector')
      );

      if (integrationLinks.length > 0) {
        for (const link of integrationLinks.slice(0, 3)) {
          const result = await tryFetchPage(link);
          if (result) {
            console.log(`SCRAPED (via root crawl): ${link}`);
            return result;
          }
        }
      }
    } catch { /* continue */ }
  }

  return null;
}

async function trySitemapDiscovery(baseUrl: string, domain: string): Promise<string | null> {
  try {
    // Try sitemap.xml and sitemap-pages.xml
    for (const sitemapPath of ['/sitemap.xml', '/sitemap-pages.xml']) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${baseUrl}${sitemapPath}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackSeam/1.0)' },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeout);
      if (res.status < 200 || res.status >= 400) continue;
      const xml = await res.text();

      // Check for nested sitemaps first
      const nestedSitemapRegex = /<loc>(https?:\/\/[^<]+sitemap[^<]*\.xml)<\/loc>/gi;
      let nestedMatch;
      while ((nestedMatch = nestedSitemapRegex.exec(xml)) !== null) {
        const nestedResult = await trySitemapDiscovery(nestedMatch[1].replace(/\/sitemap[^/]*\.xml$/, ''), domain);
        if (nestedResult) return nestedResult;
      }

      // Extract all URLs from sitemap
      const urlRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
      const allUrls: string[] = [];
      let urlMatch;
      while ((urlMatch = urlRegex.exec(xml)) !== null) {
        allUrls.push(urlMatch[1]);
      }

      // Filter for integration-related URLs
      const integrationUrls = allUrls.filter(u =>
        u.toLowerCase().includes('integration') || u.toLowerCase().includes('partner') ||
        u.toLowerCase().includes('connector') || u.toLowerCase().includes('marketplace')
      );

      if (integrationUrls.length > 0) {
        console.log(`Found ${integrationUrls.length} integration URLs in sitemap`);
        // Build content from sitemap URLs — these are verified real URLs
        const content = `Source: ${baseUrl} (sitemap discovery)\n\nReal integration page URLs found in sitemap:\n${integrationUrls.join('\n')}`;
        return content;
      }
    }
  } catch { /* continue */ }
  return null;
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackSeam/1.0)' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
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
      l.includes('plugin') || l.includes('marketplace') || l.includes('app') ||
      l.includes('doc') || l.includes('guide')
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
  // If we have a focus app, try to scrape its vendor page first
  let scrapedContent = '';
  if (focusApp) {
    const vendorUrl = vendorUrls.get(focusApp.toLowerCase());
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
1. Only include integrations where you can provide a REAL documentation URL.
2. If scraped vendor page data is provided above, USE THOSE URLs — they are verified real URLs.
3. The documentation_url MUST be from one of the two integration partners' official domains.
4. Do NOT fabricate or guess URLs. If you're not certain a URL exists, do NOT include it.
5. Prefer URLs from official knowledge bases, help centers, and marketplace listings.`;

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
            ? `You are an MSP/IT integration expert. Only report integrations involving ${focusApp}. If scraped vendor page data is provided, prioritize using those real URLs as documentation_url values.`
            : "You are an MSP/IT integration expert. If scraped vendor page data is provided, prioritize using those real URLs.",
        },
        { role: "user", content: prompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "report_integrations",
          description: "Report discovered integrations. Use real documentation URLs from scraped vendor pages when available.",
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
                    documentation_url: { type: "string", description: "A real URL from one of the two platforms' official domains. Use URLs from scraped data when available." },
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

  const candidates = integrations.filter((i: any) => isValidDocUrl(i.documentation_url));

  console.log(`Verifying ${candidates.length} candidate URLs...`);
  const verified: any[] = [];

  for (let i = 0; i < candidates.length; i += 5) {
    const batch = candidates.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (integ: any) => {
        const ok = await verifyUrl(integ.documentation_url);
        if (!ok) {
          console.log(`DEAD: ${integ.source} -> ${integ.target}: ${integ.documentation_url}`);
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

  console.log(`${focusFiltered.length}/${candidates.length} URLs verified as live${focusApp ? ` for ${focusApp}` : ''}`);
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
        vendorUrls.set(app.name.toLowerCase(), app.vendor_url);
      }
      const nameKey = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      domains.push(nameKey + '.com');
      vendorMap.set(app.name.toLowerCase(), domains);
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
    vendorMap.set(app.name.toLowerCase(), domains);
  }
  return vendorMap;
}

function buildVendorUrlMap(orgApps: any[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const oa of orgApps) {
    const app = oa.applications;
    if (app?.vendor_url) {
      map.set(app.name.toLowerCase(), app.vendor_url);
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
    const key = `${i.source?.toLowerCase()}|${i.target?.toLowerCase()}`;
    const revKey = `${i.target?.toLowerCase()}|${i.source?.toLowerCase()}`;
    if (seen.has(key) || seen.has(revKey)) return false;
    seen.add(key);
    return true;
  });

  const domainValidated = unique.filter(integ => {
    const sourceDomains = vendorMap.get(integ.source?.toLowerCase()) || [];
    const targetDomains = vendorMap.get(integ.target?.toLowerCase()) || [];
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
    ? domainValidated.filter(integ => normalizeName(integ.source) === normalizedFocusApp || normalizeName(integ.target) === normalizedFocusApp)
    : domainValidated;

  console.log(`${focusFiltered.length}/${unique.length} passed validation${focusApp ? ` for ${focusApp}` : ''}`);

  const { data: allApps } = await supabase.from("applications").select("id, name");
  const appMap = new Map((allApps || []).map((a: any) => [a.name.toLowerCase(), a.id]));

  let newCount = 0;
  for (const integ of focusFiltered) {
    const sourceId = appMap.get(integ.source?.toLowerCase());
    const targetId = appMap.get(integ.target?.toLowerCase());
    if (!sourceId || !targetId || sourceId === targetId) continue;

    const { data: reverseExists } = await supabase
      .from("integrations")
      .select("id")
      .eq("source_app_id", targetId)
      .eq("target_app_id", sourceId)
      .maybeSingle();

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

    if (!error) newCount++;
  }

  return { discovered: focusFiltered.length, saved: newCount, integrations: focusFiltered };
}
