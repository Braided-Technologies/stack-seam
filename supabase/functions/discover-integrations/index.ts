import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const appList = app_names.join(", ");
    const prompt = `You are an IT integration expert. Given the following IT/MSP software tools: ${appList}

For each PAIR of tools that has a known integration or connection available, provide the details.

Return a JSON array of integration objects. Each object must have:
- "source": exact name of first app (from the list provided)
- "target": exact name of second app (from the list provided)
- "description": 1-2 sentence description of what the integration does
- "integration_type": one of "native", "api", "zapier", "webhook", "other"
- "data_shared": comma-separated list of what data types are shared (e.g. "Tickets, Devices, Alerts")
- "documentation_url": URL to the official integration documentation (must be a real, valid URL)

Only include integrations that actually exist. Do not make up integrations. If you're unsure about a documentation URL, use the vendor's main integrations page.
Return ONLY the JSON array, no other text.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an IT integration expert. Return only valid JSON arrays. Be accurate - only include integrations that truly exist." },
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
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds at Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const parsed = JSON.parse(toolCall.function.arguments);
    const integrations = parsed.integrations || [];

    // Now store discovered integrations in DB using service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get all applications to map names to IDs
    const { data: allApps } = await supabase.from("applications").select("id, name");
    const appMap = new Map((allApps || []).map(a => [a.name.toLowerCase(), a.id]));

    let newCount = 0;
    for (const integ of integrations) {
      const sourceId = appMap.get(integ.source.toLowerCase());
      const targetId = appMap.get(integ.target.toLowerCase());
      if (!sourceId || !targetId || sourceId === targetId) continue;

      // Upsert - skip if already exists
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

    return new Response(JSON.stringify({
      discovered: integrations.length,
      saved: newCount,
      integrations,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("discover-integrations error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
