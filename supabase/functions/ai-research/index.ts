import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, stackContext, model: requestedModel } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowedModels = [
      "google/gemini-3-flash-preview", "google/gemini-2.5-flash", "google/gemini-2.5-pro",
      "google/gemini-2.5-flash-lite", "google/gemini-3.1-pro-preview",
      "openai/gpt-5", "openai/gpt-5-mini", "openai/gpt-5-nano", "openai/gpt-5.2",
    ];

    // Get user's org
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
    let apiKey = Deno.env.get("LOVABLE_API_KEY");
    let model = (requestedModel && allowedModels.includes(requestedModel)) ? requestedModel : "google/gemini-3-flash-preview";

    // Check for BYOK settings
    if (roleData?.organization_id) {
      const { data: settings } = await supabase
        .from("org_settings")
        .select("setting_key, setting_value")
        .eq("organization_id", roleData.organization_id)
        .in("setting_key", ["ai_provider", "ai_api_key", "ai_model"]);

      if (settings && settings.length > 0) {
        const settingsMap: Record<string, string> = {};
        for (const s of settings) {
          if (s.setting_value) settingsMap[s.setting_key] = s.setting_value;
        }

        if (settingsMap.ai_provider && settingsMap.ai_provider !== "lovable" && settingsMap.ai_api_key) {
          apiKey = settingsMap.ai_api_key;
          if (settingsMap.ai_provider === "openai") {
            aiUrl = "https://api.openai.com/v1/chat/completions";
            model = settingsMap.ai_model || "gpt-4o";
          } else if (settingsMap.ai_provider === "anthropic") {
            aiUrl = "https://api.anthropic.com/v1/messages";
            model = settingsMap.ai_model || "claude-sonnet-4-20250514";
          }
        } else if (settingsMap.ai_model) {
          model = settingsMap.ai_model;
        }
      }
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No AI API key configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an expert IT stack advisor for Managed Service Providers (MSPs). You help MSP teams research tools, compare vendors, get recommendations, and answer IT infrastructure questions.

Be specific, practical, and data-driven. When comparing tools, use tables. When recommending, consider MSP-specific needs like multi-tenancy, RMM integration, PSA compatibility, and per-technician pricing.

CRITICAL RULES:
- Only cite tools, products, and features that you can verify actually exist. Do NOT fabricate product names, features, or integrations.
- If you are unsure whether a product or feature exists, say so explicitly rather than guessing.
- When possible, include URLs or references to official documentation to support your claims.
- Add clear paragraph breaks between sections for readability.

${stackContext ? `The user's current stack includes: ${stackContext}. Reference their existing tools when relevant.` : ""}`;

    const response = await fetch(aiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", status, errorText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-research error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
