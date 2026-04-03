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

async function discoverBatch(appNames: string[], LOVABLE_API_KEY: string) {
  const appList = appNames.join(", ");
  const prompt = `You are an expert on MSP/IT software integrations. Given these tools: ${appList}

List ALL known integrations between ANY pair of these tools. Be thorough — include:
- Native/built-in integrations
- API-based integrations
- Integrations through platforms like Zapier, Power Automate, etc.
- PSA/RMM integrations with documentation, cybersecurity, billing tools
- Vendor marketplace integrations
- MCP (Model Context Protocol) server integrations — community-built connectors that allow AI tools like Claude, ChatGPT, etc. to integrate with platforms. Include GitHub repo URLs as documentation for these.

CRITICAL RULES:
1. Only include integrations where you can provide a REAL, VERIFIABLE documentation URL. Do NOT fabricate or guess URLs.
2. The documentation_url must be an actual page on the vendor's website, knowledge base, marketplace, or GitHub repo that describes the integration.
3. If you cannot find a real documentation URL for an integration, do NOT include it.
4. Do NOT make up URLs that look plausible — only use URLs you are confident exist.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are an MSP/IT integration expert. Be thorough and accurate. Only include integrations that truly exist AND have verifiable documentation URLs. Never fabricate URLs. For MCP server integrations, use the GitHub repo URL as documentation." },
        { role: "user", content: prompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "report_integrations",
          description: "Report discovered integrations between IT tools. Every integration MUST have a real documentation_url.",
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
                    integration_type: { type: "string", enum: ["native", "api", "zapier", "webhook", "mcp", "other"] },
                    data_shared: { type: "string" },
                    documentation_url: { type: "string", description: "REQUIRED. A real, verifiable URL to the integration documentation page." },
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

  return integrations.filter((i: any) => isValidDocUrl(i.documentation_url));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { app_names, scheduled } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Scheduled mode: iterate all orgs
    if (scheduled) {
      const { data: orgs } = await supabaseAdmin.from("organizations").select("id");
      let totalDiscovered = 0;
      let totalSaved = 0;

      for (const org of orgs || []) {
        const { data: orgApps } = await supabaseAdmin
          .from("user_applications")
          .select("application_id, applications(name)")
          .eq("organization_id", org.id);

        const names = (orgApps || []).map((a: any) => a.applications?.name).filter(Boolean);
        if (names.length < 2) continue;

        try {
          const result = await processDiscovery(names, LOVABLE_API_KEY, supabaseAdmin);
          totalDiscovered += result.discovered;
          totalSaved += result.saved;
        } catch (e) {
          console.error(`Discovery failed for org ${org.id}:`, e);
        }

        // Rate limit buffer between orgs
        await new Promise(r => setTimeout(r, 2000));
      }

      return new Response(JSON.stringify({ scheduled: true, totalDiscovered, totalSaved }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Manual mode
    if (!app_names || !Array.isArray(app_names) || app_names.length < 2) {
      return new Response(JSON.stringify({ error: "At least 2 app names required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await processDiscovery(app_names, LOVABLE_API_KEY, supabaseAdmin);

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

async function processDiscovery(appNames: string[], apiKey: string, supabase: any) {
  const BATCH_SIZE = 15;
  const allIntegrations: any[] = [];

  if (appNames.length <= BATCH_SIZE) {
    const results = await discoverBatch(appNames, apiKey);
    allIntegrations.push(...results);
  } else {
    for (let i = 0; i < appNames.length; i += BATCH_SIZE - 3) {
      const batch = appNames.slice(i, i + BATCH_SIZE);
      if (batch.length < 2) break;
      try {
        const results = await discoverBatch(batch, apiKey);
        allIntegrations.push(...results);
      } catch (e: any) {
        if (e.message === "RATE_LIMITED") {
          await new Promise(r => setTimeout(r, 3000));
          try {
            const results = await discoverBatch(batch, apiKey);
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

  // Deduplicate
  const seen = new Set<string>();
  const unique = allIntegrations.filter(i => {
    const key = `${i.source?.toLowerCase()}|${i.target?.toLowerCase()}`;
    const revKey = `${i.target?.toLowerCase()}|${i.source?.toLowerCase()}`;
    if (seen.has(key) || seen.has(revKey)) return false;
    seen.add(key);
    return true;
  });

  // Store
  const { data: allApps } = await supabase.from("applications").select("id, name");
  const appMap = new Map((allApps || []).map((a: any) => [a.name.toLowerCase(), a.id]));

  let newCount = 0;
  for (const integ of unique) {
    const sourceId = appMap.get(integ.source?.toLowerCase());
    const targetId = appMap.get(integ.target?.toLowerCase());
    if (!sourceId || !targetId || sourceId === targetId) continue;

    // Check for reverse duplicate — only keep one direction
    const { data: reverseExists } = await supabase
      .from("integrations")
      .select("id")
      .eq("source_app_id", targetId)
      .eq("target_app_id", sourceId)
      .maybeSingle();

    if (reverseExists) continue; // Skip — reverse already exists

    const { error } = await supabase
      .from("integrations")
      .upsert({
        source_app_id: sourceId,
        target_app_id: targetId,
        description: integ.description,
        integration_type: integ.integration_type,
        data_shared: integ.data_shared,
        documentation_url: integ.documentation_url,
        last_verified: new Date().toISOString(),
      }, { onConflict: "source_app_id,target_app_id" });

    if (!error) newCount++;
  }

  return { discovered: unique.length, saved: newCount, integrations: unique };
}
