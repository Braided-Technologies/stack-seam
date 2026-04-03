import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function discoverBatch(appNames: string[], LOVABLE_API_KEY: string) {
  const appList = appNames.join(", ");
  const prompt = `You are an expert on MSP/IT software integrations. Given these tools: ${appList}

List ALL known integrations between ANY pair of these tools. Be thorough — include:
- Native/built-in integrations (e.g. Hudu has native integrations with HaloPSA, N-central, NinjaOne, etc.)
- API-based integrations
- Integrations through platforms like Zapier, Power Automate, etc.
- PSA/RMM integrations with documentation, cybersecurity, billing tools
- Vendor marketplace integrations
- Known KB articles or integration guides

Be EXHAUSTIVE. For example:
- Hudu integrates natively with: ConnectWise Manage, Datto RMM, N-central, NinjaOne, HaloPSA, IT Glue (migration), Syncro, and many more
- HaloPSA integrates with: Hudu, Xero, QuickBooks, Datto RMM, NinjaOne, CrowdStrike, SentinelOne, etc.
- CloudRadial integrates with HaloPSA, ConnectWise, Autotask
- CIPP integrates with Microsoft 365, Azure AD
- ScalePad integrates with ConnectWise, Autotask, HaloPSA, Syncro

Think about EVERY combination. Don't miss integrations that exist.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are an MSP/IT integration expert. Be thorough and accurate. Only include integrations that truly exist. Return as many real integrations as possible." },
        { role: "user", content: prompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "report_integrations",
          description: "Report discovered integrations between IT tools",
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
                    documentation_url: { type: "string" },
                  },
                  required: ["source", "target", "description", "integration_type", "data_shared"],
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
  return parsed.integrations || [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { app_names } = await req.json();
    if (!app_names || !Array.isArray(app_names) || app_names.length < 2) {
      return new Response(JSON.stringify({ error: "At least 2 app names required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Process in batches of ~15 apps to get more thorough results
    const BATCH_SIZE = 15;
    const allIntegrations: any[] = [];

    if (app_names.length <= BATCH_SIZE) {
      const results = await discoverBatch(app_names, LOVABLE_API_KEY);
      allIntegrations.push(...results);
    } else {
      // Create overlapping batches so cross-batch integrations are found
      for (let i = 0; i < app_names.length; i += BATCH_SIZE - 3) {
        const batch = app_names.slice(i, i + BATCH_SIZE);
        if (batch.length < 2) break;
        try {
          const results = await discoverBatch(batch, LOVABLE_API_KEY);
          allIntegrations.push(...results);
        } catch (e: any) {
          if (e.message === "RATE_LIMITED") {
            // Wait and retry once
            await new Promise(r => setTimeout(r, 3000));
            try {
              const results = await discoverBatch(batch, LOVABLE_API_KEY);
              allIntegrations.push(...results);
            } catch {
              console.error("Batch failed after retry, skipping");
            }
          } else if (e.message === "CREDITS_EXHAUSTED") {
            return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds at Settings > Workspace > Usage." }), {
              status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
    }

    // Deduplicate by source+target
    const seen = new Set<string>();
    const unique = allIntegrations.filter(i => {
      const key = `${i.source?.toLowerCase()}|${i.target?.toLowerCase()}`;
      const revKey = `${i.target?.toLowerCase()}|${i.source?.toLowerCase()}`;
      if (seen.has(key) || seen.has(revKey)) return false;
      seen.add(key);
      return true;
    });

    // Store in DB
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: allApps } = await supabase.from("applications").select("id, name");
    const appMap = new Map((allApps || []).map(a => [a.name.toLowerCase(), a.id]));

    let newCount = 0;
    for (const integ of unique) {
      const sourceId = appMap.get(integ.source?.toLowerCase());
      const targetId = appMap.get(integ.target?.toLowerCase());
      if (!sourceId || !targetId || sourceId === targetId) continue;

      const { error } = await supabase
        .from("integrations")
        .upsert({
          source_app_id: sourceId,
          target_app_id: targetId,
          description: integ.description,
          integration_type: integ.integration_type,
          data_shared: integ.data_shared,
          documentation_url: integ.documentation_url || null,
          last_verified: new Date().toISOString(),
        }, { onConflict: "source_app_id,target_app_id" });

      if (!error) newCount++;
    }

    return new Response(JSON.stringify({
      discovered: unique.length,
      saved: newCount,
      integrations: unique,
    }), {
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
