import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

// Provider → base URL mapping (all OpenAI-compatible except Anthropic)
const PROVIDER_URLS: Record<string, string> = {
  builtin: "https://api.openai.com/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  grok: "https://api.x.ai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
};

const ALLOWED_BUILTIN_MODELS = [
  "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
  "o4-mini", "o3", "o3-mini",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
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
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { messages, stackContext, model: requestedModel } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get user's org
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const orgId = roleData?.organization_id;

    let aiUrl = PROVIDER_URLS.builtin;
    let apiKey = Deno.env.get("OPENAI_API_KEY");
    let model = (requestedModel && ALLOWED_BUILTIN_MODELS.includes(requestedModel)) ? requestedModel : "gpt-4o-mini";
    let usingBuiltIn = true;

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check for BYOK settings
    if (orgId) {
      const { data: settings } = await supabase
        .from("org_settings")
        .select("setting_key, setting_value")
        .eq("organization_id", orgId)
        .in("setting_key", ["ai_provider", "ai_model"]);

      const settingsMap: Record<string, string> = {};
      for (const s of settings || []) {
        if (s.setting_value) settingsMap[s.setting_key] = s.setting_value;
      }

      const provider = settingsMap.ai_provider || "builtin";
      if (provider !== "builtin") {
        // Pull the encrypted BYOK key from vault via service role
        const { data: secretValue } = await serviceClient.rpc("get_org_secret_value", {
          _org_id: orgId,
          _key: "ai_api_key",
        });
        if (secretValue) {
          apiKey = secretValue;
          aiUrl = PROVIDER_URLS[provider] || PROVIDER_URLS.openai;
          model = settingsMap.ai_model || model;
          usingBuiltIn = false;
        }
      } else if (settingsMap.ai_model && ALLOWED_BUILTIN_MODELS.includes(settingsMap.ai_model)) {
        model = settingsMap.ai_model;
      }
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No AI API key configured" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Rate limit check (only for built-in provider)
    if (usingBuiltIn && orgId) {
      const { data: allowed } = await serviceClient.rpc("check_and_increment_ai_usage", {
        _org_id: orgId,
        _daily_limit: 50,
      });

      if (allowed === false) {
        return new Response(JSON.stringify({
          error: "Daily AI limit reached. Add your own API key in Settings to continue, or try again tomorrow.",
          code: "RATE_LIMITED",
        }), {
          status: 429,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
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
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI error:", status, errorText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders(req), "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-research error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
