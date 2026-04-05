import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isValidDocUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length < 10) return false;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  if (trimmed.includes('example.com') || trimmed.includes('placeholder') || trimmed.includes('your-')) return false;
  return true;
}

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

async function discoverBatch(appNames: string[], LOVABLE_API_KEY: string, focusApp?: string) {
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
- PSA/RMM integrations with documentation, cybersecurity, billing tools
- Vendor marketplace integrations

CRITICAL RULES:
1. Only include integrations where you can provide a REAL documentation URL from the vendor's actual website or knowledge base.
2. The documentation_url MUST be from one of the two integration partners' official domains (e.g. for a HaloPSA↔ScalePad integration, the URL must be from halopsa.com, usehalo.com, scalepad.com, or similar official domains).
3. Do NOT use third-party blog posts, review sites, or generic URLs.
4. If you are not 100% certain a URL exists on the vendor's domain, do NOT include the integration.
5. Prefer URLs from official knowledge bases, help centers, and marketplace listings.
6. Do NOT include MCP or community integrations unless the GitHub repo URL is verified.`;

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
            ? `You are an MSP/IT integration expert. Only report integrations involving ${focusApp}. Only report integrations with documentation URLs you are confident are real and accessible, and the URL must come from one of the two platforms' official domains.`
            : "You are an MSP/IT integration expert. Only report integrations with documentation URLs you are confident are real and accessible. The documentation URL must come from one of the two platforms' official domains.",
        },
        { role: "user", content: prompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "report_integrations",
          description: focusApp
            ? `Report discovered integrations involving ${focusApp}. Every integration MUST have a real documentation_url from one of the two platforms' domains.`
            : "Report discovered integrations between IT tools. Every integration MUST have a real documentation_url from one of the two platforms' domains.",
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
                    documentation_url: { type: "string", description: "REQUIRED. A real URL from one of the two platforms' official domains." },
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
          const appVendorMap = buildVendorMap(orgApps || [], supabaseAdmin);
          const result = await processDiscovery(names, LOVABLE_API_KEY, supabaseAdmin, await appVendorMap);
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
    for (const app of allApps || []) {
      const domains: string[] = [];
      if (app.vendor_url) {
        const d = extractDomain(app.vendor_url);
        if (d) domains.push(d);
      }
      const nameKey = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      domains.push(nameKey + '.com');
      vendorMap.set(app.name.toLowerCase(), domains);
    }

    const result = await processDiscovery(app_names, LOVABLE_API_KEY, supabaseAdmin, vendorMap, focus_app);

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

async function buildVendorMap(orgApps: any[], supabase: any): Promise<Map<string, string[]>> {
  const vendorMap = new Map<string, string[]>();
  const { data: allApps } = await supabase.from("applications").select("id, name, vendor_url");
  for (const app of allApps || []) {
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

async function processDiscovery(appNames: string[], apiKey: string, supabase: any, vendorMap: Map<string, string[]>, focusApp?: string) {
  const BATCH_SIZE = 15;
  const allIntegrations: any[] = [];

  if (appNames.length <= BATCH_SIZE) {
    const results = await discoverBatch(appNames, apiKey, focusApp);
    allIntegrations.push(...results);
  } else {
    for (let i = 0; i < appNames.length; i += BATCH_SIZE - 3) {
      const batch = appNames.slice(i, i + BATCH_SIZE);
      if (batch.length < 2) break;
      try {
        const results = await discoverBatch(batch, apiKey, focusApp);
        allIntegrations.push(...results);
      } catch (e: any) {
        if (e.message === "RATE_LIMITED") {
          await new Promise(r => setTimeout(r, 3000));
          try {
            const results = await discoverBatch(batch, apiKey, focusApp);
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
