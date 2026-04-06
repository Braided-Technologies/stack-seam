import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeName(name: string | undefined | null): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildLookupKeys(name: string | undefined | null): string[] {
  const lower = (name || '').toLowerCase().trim();
  if (!lower) return [];
  const spaced = lower.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const compact = spaced.replace(/\s+/g, '');
  return [...new Set([lower, spaced, compact].filter(Boolean))];
}

function getMappedValue<T>(map: Map<string, T>, name: string | undefined | null): T | undefined {
  for (const key of buildLookupKeys(name)) {
    const v = map.get(key);
    if (v !== undefined) return v;
  }
  return undefined;
}

async function fetchPageText(url: string): Promise<{ text: string; links: string[] } | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackSeam/1.0)' },
      signal: c.signal,
      redirect: 'follow',
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const html = await res.text();
    if (html.length < 300) return null;

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000);

    const links: string[] = [];
    const absRx = /href="(https?:\/\/[^"]+)"/gi;
    const relRx = /href="(\/[^"]+)"/gi;
    let m;
    while ((m = absRx.exec(html)) !== null) links.push(m[1]);
    while ((m = relRx.exec(html)) !== null) {
      try { links.push(new URL(m[1], url).href); } catch { /* skip */ }
    }

    return { text, links: [...new Set(links)] };
  } catch {
    return null;
  }
}

async function callAI(apiKey: string, messages: any[], tools?: any[], toolChoice?: any) {
  const body: any = { model: "google/gemini-2.5-flash", messages, max_tokens: 8192 };
  if (tools) { body.tools = tools; body.tool_choice = toolChoice; }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("RATE_LIMITED");
    if (res.status === 402) throw new Error("CREDITS_EXHAUSTED");
    const t = await res.text();
    console.error("AI error:", res.status, t);
    throw new Error("AI gateway error");
  }
  return await res.json();
}

// PASS 1: Ask AI to identify the vendor's integration pages and docs subdomains
async function pass1_findIntegrationPages(
  appName: string,
  vendorUrl: string | undefined,
  apiKey: string
): Promise<string[]> {
  const vendorDomain = vendorUrl ? extractDomain(vendorUrl) : `${normalizeName(appName)}.com`;

  const prompt = `For the software application "${appName}" (vendor domain: ${vendorDomain}):

1. Find the vendor's official integrations/partnerships page. Check paths like:
   - /integrations, /partners, /ecosystem, /marketplace, /apps, /connections, /plugins, /extensions
2. Check documentation subdomains: docs.${vendorDomain}, support.${vendorDomain}, help.${vendorDomain}, kb.${vendorDomain}
3. Check for integration guides sections in their docs/KB site.

Return ALL real URLs you know of that list integrations or contain integration documentation for ${appName}.
Only return URLs you are confident actually exist — do NOT fabricate URLs.`;

  const aiData = await callAI(apiKey, [
    { role: "system", content: "You are an expert at finding software vendor integration pages. Only return URLs you are confident exist." },
    { role: "user", content: prompt },
  ], [{
    type: "function",
    function: {
      name: "report_integration_pages",
      description: "Report discovered integration page URLs for this vendor",
      parameters: {
        type: "object",
        properties: {
          pages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string", description: "Full URL of the integration page" },
                type: { type: "string", enum: ["integrations_listing", "marketplace", "docs_hub", "partners_page", "api_docs"] },
              },
              required: ["url", "type"],
              additionalProperties: false,
            },
          },
        },
        required: ["pages"],
        additionalProperties: false,
      },
    },
  }], { type: "function", function: { name: "report_integration_pages" } });

  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return [];

  const parsed = JSON.parse(toolCall.function.arguments);
  const urls = (parsed.pages || []).map((p: any) => p.url).filter((u: string) => u.startsWith('http'));
  console.log(`Pass 1: AI suggested ${urls.length} integration pages for ${appName}`);
  return urls;
}

// PASS 2: Scrape those pages, then ask AI to extract structured integrations
async function pass2_extractIntegrations(
  appName: string,
  stackAppNames: string[],
  pageUrls: string[],
  apiKey: string
): Promise<any[]> {
  // Fetch all pages in parallel (max 10)
  const pagesToFetch = pageUrls.slice(0, 10);
  const fetchResults = await Promise.allSettled(pagesToFetch.map(u => fetchPageText(u)));

  let scrapedContent = '';
  const allSubLinks: string[] = [];

  for (let i = 0; i < fetchResults.length; i++) {
    const result = fetchResults[i];
    if (result.status === 'fulfilled' && result.value) {
      const { text, links } = result.value;
      scrapedContent += `\n\n=== PAGE: ${pagesToFetch[i]} ===\n${text}`;

      // Collect sub-links that might be specific integration pages
      const integrationLinks = links.filter(l =>
        l.includes('integration') || l.includes('partner') || l.includes('connector') ||
        l.includes('marketplace') || l.includes('apps/') || l.includes('plugin')
      ).slice(0, 30);
      allSubLinks.push(...integrationLinks);
    } else {
      console.log(`Pass 2: Failed to fetch ${pagesToFetch[i]}`);
    }
  }

  // Also try to fetch a few specific sub-links for deeper content
  const uniqueSubLinks = [...new Set(allSubLinks)].slice(0, 15);
  if (uniqueSubLinks.length > 0) {
    const subResults = await Promise.allSettled(uniqueSubLinks.map(u => fetchPageText(u)));
    for (let i = 0; i < subResults.length; i++) {
      const result = subResults[i];
      if (result.status === 'fulfilled' && result.value) {
        scrapedContent += `\n\n=== SUB-PAGE: ${uniqueSubLinks[i]} ===\n${result.value.text.slice(0, 4000)}`;
      }
    }
  }

  if (!scrapedContent) {
    console.log(`Pass 2: No pages could be scraped for ${appName}`);
    return [];
  }

  const stackList = stackAppNames.join(', ');

  const prompt = `I've scraped the integration/partnership pages for "${appName}". Here's the content:

${scrapedContent.slice(0, 30000)}

TASK: From this scraped content, extract ALL integrations available for "${appName}".

For context, these are the other apps in the user's stack: ${stackList}
Prioritize integrations with these apps, but also include any other integrations found on the pages.

For each integration found, provide:
- The integration partner name
- The direct URL to that specific integration's detail/documentation page (from the scraped links)
- Connection type: native, api, webhook, syslog, agent-based, ztna, oauth, saml_sso, zapier, or other
- Brief description of what the integration does
- What data is shared

CRITICAL RULES:
1. ONLY include integrations you can see evidence of in the scraped content above.
2. The documentation_url MUST be a specific page URL found in the scraped content — NOT a generic listing page.
3. If you can't find a specific documentation URL for an integration from the scraped content, still include it but set documentation_url to empty string.
4. Do NOT add integrations from your training data that aren't evidenced in the scraped content.`;

  const aiData = await callAI(apiKey, [
    { role: "system", content: `You are extracting integration data from scraped web pages for ${appName}. Only report what you see in the scraped content. Be thorough but accurate.` },
    { role: "user", content: prompt },
  ], [{
    type: "function",
    function: {
      name: "report_integrations",
      description: "Report integrations found in the scraped vendor pages",
      parameters: {
        type: "object",
        properties: {
          integrations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source: { type: "string", description: "Always the focus app name" },
                target: { type: "string", description: "The integration partner name" },
                description: { type: "string" },
                integration_type: {
                  type: "string",
                  enum: ["native", "api", "webhook", "syslog", "agent-based", "ztna", "oauth", "saml_sso", "zapier", "other"],
                },
                data_shared: { type: "string" },
                documentation_url: { type: "string", description: "Specific page URL from scraped content, or empty if not found" },
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
  }], { type: "function", function: { name: "report_integrations" } });

  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return [];

  const parsed = JSON.parse(toolCall.function.arguments);
  const integrations = parsed.integrations || [];
  console.log(`Pass 2: AI extracted ${integrations.length} integrations for ${appName}`);
  return integrations;
}

// Verify a URL is alive and mentions the expected app
async function verifyUrl(url: string, otherAppName: string): Promise<boolean> {
  if (!url || url.length < 10 || !url.startsWith('http')) return false;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackSeam/1.0)' },
      signal: c.signal,
      redirect: 'follow',
    });
    clearTimeout(t);
    if (!res.ok) return false;
    const html = await res.text();
    if (html.length < 200) return false;

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    const searchTerms = buildLookupKeys(otherAppName);
    return searchTerms.some(term => text.includes(term));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Verify caller is authenticated
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getUser();
    if (claimsErr || !claims?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { focus_app, stack_app_names, remove_undocumented } = body;

    if (!focus_app || typeof focus_app !== 'string') {
      return new Response(JSON.stringify({ error: "focus_app is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stackNames: string[] = Array.isArray(stack_app_names) ? stack_app_names : [];

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Look up the focus app
    const { data: allApps } = await serviceClient.from("applications").select("id, name, vendor_url");
    const appMap = new Map<string, string>();
    const vendorUrlMap = new Map<string, string>();
    for (const app of allApps || []) {
      for (const key of buildLookupKeys(app.name)) {
        if (!appMap.has(key)) appMap.set(key, app.id);
        if (app.vendor_url) vendorUrlMap.set(key, app.vendor_url);
      }
    }

    const focusAppId = getMappedValue(appMap, focus_app);
    if (!focusAppId) {
      return new Response(JSON.stringify({ error: `App "${focus_app}" not found` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vendorUrl = getMappedValue(vendorUrlMap, focus_app);

    console.log(`Deep scan starting for "${focus_app}" (vendor: ${vendorUrl || 'unknown'})`);

    // PASS 1: Find integration pages
    const integrationPageUrls = await pass1_findIntegrationPages(focus_app, vendorUrl, LOVABLE_API_KEY);

    // Also try scraping common paths directly as fallback
    const vendorDomain = vendorUrl ? extractDomain(vendorUrl) : '';
    const fallbackPaths = ['/integrations', '/partners', '/marketplace', '/ecosystem', '/apps'];
    const bases = vendorDomain
      ? [`https://${vendorDomain}`, `https://docs.${vendorDomain}`, `https://help.${vendorDomain}`, `https://support.${vendorDomain}`]
      : [];
    const fallbackUrls = bases.flatMap(b => fallbackPaths.map(p => `${b}${p}`));

    const allPageUrls = [...new Set([...integrationPageUrls, ...fallbackUrls])];

    // PASS 2: Scrape and extract
    const rawIntegrations = await pass2_extractIntegrations(focus_app, stackNames, allPageUrls, LOVABLE_API_KEY);

    // Verify documentation URLs in parallel batches
    console.log(`Verifying ${rawIntegrations.length} integration URLs...`);
    const verified: any[] = [];
    for (let i = 0; i < rawIntegrations.length; i += 5) {
      const batch = rawIntegrations.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (integ: any) => {
          if (!integ.documentation_url) {
            return { integ: { ...integ, link_status: 'unchecked' }, valid: true };
          }
          const ok = await verifyUrl(integ.documentation_url, integ.target);
          if (!ok) {
            console.log(`VERIFY_FAIL: ${integ.target}: ${integ.documentation_url}`);
            return { integ: { ...integ, documentation_url: '', link_status: 'unchecked' }, valid: true };
          }
          return { integ: { ...integ, link_status: 'verified' }, valid: true };
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.valid) {
          verified.push(r.value.integ);
        }
      }
    }

    // Upsert into DB
    let savedCount = 0;
    let removedCount = 0;

    for (const integ of verified) {
      const targetId = getMappedValue(appMap, integ.target);
      if (!targetId || targetId === focusAppId) continue;

      // Check both directions
      const { data: existing } = await serviceClient
        .from("integrations")
        .select("id")
        .or(`and(source_app_id.eq.${focusAppId},target_app_id.eq.${targetId}),and(source_app_id.eq.${targetId},target_app_id.eq.${focusAppId})`)
        .maybeSingle();

      if (existing) {
        // Update existing
        const updateData: any = {
          description: integ.description,
          integration_type: integ.integration_type,
          data_shared: integ.data_shared,
          last_verified: new Date().toISOString(),
        };
        if (integ.documentation_url) {
          updateData.documentation_url = integ.documentation_url;
          updateData.link_status = integ.link_status;
        }
        await serviceClient.from("integrations").update(updateData).eq("id", existing.id);
        savedCount++;
      } else {
        // Insert new
        const { error } = await serviceClient.from("integrations").insert({
          source_app_id: focusAppId,
          target_app_id: targetId,
          description: integ.description,
          integration_type: integ.integration_type,
          data_shared: integ.data_shared,
          documentation_url: integ.documentation_url || null,
          link_status: integ.link_status || 'unchecked',
          last_verified: new Date().toISOString(),
        });
        if (!error) savedCount++;
      }
    }

    // CLEANUP: Remove integrations for this app that have no documentation URL
    if (remove_undocumented !== false) {
      const { data: existingIntegrations } = await serviceClient
        .from("integrations")
        .select("id, documentation_url, source_app_id, target_app_id")
        .or(`source_app_id.eq.${focusAppId},target_app_id.eq.${focusAppId}`);

      const discoveredTargetIds = new Set<string>();
      for (const integ of verified) {
        const tid = getMappedValue(appMap, integ.target);
        if (tid) discoveredTargetIds.add(tid);
      }

      for (const existing of existingIntegrations || []) {
        const otherId = existing.source_app_id === focusAppId ? existing.target_app_id : existing.source_app_id;

        // Only remove if: no documentation URL AND not found in this deep scan
        if (!existing.documentation_url && !discoveredTargetIds.has(otherId)) {
          const { error } = await serviceClient.from("integrations").delete().eq("id", existing.id);
          if (!error) {
            removedCount++;
            console.log(`REMOVED undocumented integration: ${existing.id}`);
          }
        }
      }
    }

    const result = {
      focus_app,
      discovered: verified.length,
      saved: savedCount,
      removed: removedCount,
      integrations: verified.map(i => ({
        target: i.target,
        type: i.integration_type,
        has_docs: !!i.documentation_url,
      })),
    };

    console.log(`Deep scan complete: ${savedCount} saved, ${removedCount} removed`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("discover-integrations-deep error:", err);
    if (err.message === "RATE_LIMITED") {
      return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (err.message === "CREDITS_EXHAUSTED") {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
