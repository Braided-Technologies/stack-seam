import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { file_path, user_application_id, delete_after_scan } = await req.json();
    if (!file_path || !user_application_id) {
      return new Response(JSON.stringify({ error: "file_path and user_application_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    // Verify user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify org membership
    const { data: orgIdData } = await userClient.rpc("get_user_org_id");
    if (!orgIdData) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await userClient.rpc("is_org_admin", { _org_id: orgIdData });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download the file from storage
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: fileData, error: dlError } = await serviceClient.storage
      .from("contracts")
      .download(file_path);

    if (dlError || !fileData) {
      return new Response(JSON.stringify({ error: "Failed to download file: " + (dlError?.message || "unknown") }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract text from the file (basic approach: read as text for now)
    const text = await fileData.text();
    const truncatedText = text.slice(0, 15000); // Limit context size

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use AI to extract contract fields
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a contract data extraction assistant. Extract structured data from contract text. Return ONLY the tool call, no other text.`,
          },
          {
            role: "user",
            content: `Extract the following fields from this contract document. If a field is not found, use null.\n\nDocument text:\n${truncatedText}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_contract_data",
              description: "Extract structured contract data",
              parameters: {
                type: "object",
                properties: {
                  vendor_name: { type: "string", description: "The vendor or provider company name" },
                  cost_monthly: { type: "number", description: "Monthly cost in USD, or null" },
                  cost_annual: { type: "number", description: "Annual cost in USD, or null" },
                  renewal_date: { type: "string", description: "Renewal or expiration date in YYYY-MM-DD format, or null" },
                  term_months: { type: "integer", description: "Contract term in months, or null" },
                  billing_cycle: { type: "string", enum: ["monthly", "annual", "quarterly", "multi-year"], description: "Billing cycle" },
                  license_count: { type: "integer", description: "Number of licenses/seats, or null" },
                  notes: { type: "string", description: "Brief summary of key contract terms" },
                },
                required: ["vendor_name"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_contract_data" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    let extractedData: any = {};

    try {
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        extractedData = JSON.parse(toolCall.function.arguments);
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
    }

    // Optionally delete the file after scanning
    if (delete_after_scan) {
      await serviceClient.storage.from("contracts").remove([file_path]);
      await serviceClient.from("contract_files").delete().eq("file_path", file_path);
    }

    return new Response(JSON.stringify({ success: true, extracted: extractedData, file_deleted: !!delete_after_scan }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("scan-contract error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
