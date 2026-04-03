import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    // Handle category update
    if (body.updateCategory && body.appId && body.categoryId) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { error } = await supabaseAdmin
        .from("applications")
        .update({ category_id: body.categoryId })
        .eq("id", body.appId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query } = body;
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Query must be at least 2 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check for existing match (case-insensitive)
    const { data: existing } = await supabaseAdmin
      .from("applications")
      .select("*, categories(name)")
      .ilike("name", `%${query.trim()}%`);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ found: true, existing: true, applications: existing }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use AI to research the tool
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Get categories for matching
    const { data: categories } = await supabaseAdmin
      .from("categories")
      .select("id, name");
    const categoryNames = (categories || []).map(c => c.name);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an IT/MSP software expert. When given a tool name or URL, identify the software product and return structured data about it. Only return real, existing software products. If you cannot identify the tool, indicate that.`,
          },
          {
            role: "user",
            content: `Identify this IT/MSP tool: "${query.trim()}". Available categories: ${categoryNames.join(", ")}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "identify_tool",
              description: "Return structured information about an identified IT/MSP tool",
              parameters: {
                type: "object",
                properties: {
                  found: { type: "boolean", description: "Whether the tool was identified as a real product" },
                  name: { type: "string", description: "Official product name" },
                  description: { type: "string", description: "One-line description of the tool" },
                  category: { type: "string", description: "Best matching category from the provided list" },
                  vendor_url: { type: "string", description: "Vendor website URL" },
                },
                required: ["found"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "identify_tool" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const toolInfo = JSON.parse(toolCall.function.arguments);

    if (!toolInfo.found) {
      return new Response(JSON.stringify({ found: false, message: "Could not identify this tool" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Match category
    const matchedCategory = (categories || []).find(
      c => c.name.toLowerCase() === toolInfo.category?.toLowerCase()
    );

    // Insert into applications
    const { data: newApp, error: insertError } = await supabaseAdmin
      .from("applications")
      .insert({
        name: toolInfo.name,
        description: toolInfo.description || null,
        category_id: matchedCategory?.id || null,
        vendor_url: toolInfo.vendor_url || null,
      })
      .select("*, categories(name)")
      .single();

    if (insertError) {
      // Could be duplicate that slipped through
      if (insertError.code === "23505") {
        const { data: dup } = await supabaseAdmin
          .from("applications")
          .select("*, categories(name)")
          .ilike("name", toolInfo.name);
        return new Response(JSON.stringify({ found: true, existing: true, applications: dup || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw insertError;
    }

    return new Response(JSON.stringify({ found: true, existing: false, application: newApp }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-tool error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
