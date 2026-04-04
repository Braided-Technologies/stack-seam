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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch KB articles for context
    const { data: articles } = await supabase
      .from("kb_articles")
      .select("title, slug, content, tags")
      .eq("is_published", true)
      .limit(50);

    // Fetch user's stack for context
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    let stackContext = "";
    let integrationContext = "";

    if (roleData?.organization_id) {
      const { data: userApps } = await supabase
        .from("user_applications")
        .select("applications(name, vendor_url, categories(name))")
        .eq("organization_id", roleData.organization_id);

      if (userApps?.length) {
        const appList = userApps
          .map((ua: any) => {
            const name = ua.applications?.name;
            const cat = ua.applications?.categories?.name || "Uncategorized";
            const url = ua.applications?.vendor_url;
            return `${name} (${cat})${url ? ` - ${url}` : ""}`;
          })
          .join("\n");
        stackContext = `\n\nThe user's current IT stack:\n${appList}`;
      }

      // Fetch integrations with documentation URLs
      const { data: integrations } = await supabase
        .from("integrations")
        .select(`
          description,
          documentation_url,
          integration_type,
          data_shared,
          source_app:applications!integrations_source_app_id_fkey(name, vendor_url),
          target_app:applications!integrations_target_app_id_fkey(name, vendor_url)
        `)
        .limit(200);

      if (integrations?.length) {
        const intList = integrations
          .map((i: any) => {
            const src = i.source_app?.name || "Unknown";
            const tgt = i.target_app?.name || "Unknown";
            const desc = i.description ? ` — ${i.description}` : "";
            const docUrl = i.documentation_url ? ` | Docs: ${i.documentation_url}` : "";
            const dataShared = i.data_shared ? ` | Data: ${i.data_shared}` : "";
            return `${src} ↔ ${tgt}${desc}${dataShared}${docUrl}`;
          })
          .join("\n");
        integrationContext = `\n\nKnown integrations in the catalog:\n${intList}`;
      }
    }

    const kbContext = articles?.length
      ? `\n\nAvailable Knowledge Base articles:\n${articles.map((a) => `- "${a.title}" (link: /support?article=${a.slug}): ${a.content?.substring(0, 200)}...`).join("\n")}`
      : "";

    const systemPrompt = `You are StackSeam's AI support assistant for Managed Service Providers (MSPs). You help users with questions about their IT stack, tool integrations, best practices, and platform usage.

Your capabilities:
- Recommend relevant Knowledge Base articles with clickable links
- Provide MSP-specific guidance on tool selection, integration, and optimization
- Help troubleshoot common IT stack issues
- Suggest best practices for security, backup, monitoring, and operations
- Find and share vendor documentation links for specific integrations
- Guide users to submit feedback/tickets when needed

IMPORTANT FORMATTING RULES:
1. When recommending a KB article, ALWAYS use a clickable markdown link: 📄 [Article Title](/support?article=SLUG)
2. When sharing integration documentation, use: 🔗 [Integration Name - Docs](URL)
3. When a user asks about connecting two specific tools, search the integration data for matching pairs and share the documentation_url if available. Also check the vendor URLs for the apps involved.
4. If the user needs human support, direct them to: [Submit Feedback](/support?tab=feedback)
5. Always use markdown links — never just paste raw URLs.

Be concise, helpful, and technically accurate. Use markdown formatting.${kbContext}${stackContext}${integrationContext}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please contact your administrator." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("help-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
