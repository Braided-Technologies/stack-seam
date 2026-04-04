import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
    const { data: isPlatformAdmin } = await userClient.rpc("is_platform_admin");
    if (!isAdmin && !isPlatformAdmin) {
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

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert file to base64 for multimodal input
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Data = arrayBufferToBase64(arrayBuffer);
    const mimeType = file_path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";

    // Use AI to extract contract fields via multimodal (send PDF directly)
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a contract/invoice data extraction assistant. You will receive a document (PDF or image). Extract ALL structured data including every individual line item, product, or service listed. Be thorough — capture every row in any table. Return ONLY the tool call, no other text.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`,
                },
              },
              {
                type: "text",
                text: "Extract all fields and every line item from this contract/invoice document. If a field is not found, use null. Be thorough with line items — include every product, service, or charge listed.",
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_contract_data",
              description: "Extract structured contract data including individual line items",
              parameters: {
                type: "object",
                properties: {
                  vendor_name: { type: "string", description: "The vendor or provider company name" },
                  cost_monthly: { type: "number", description: "Total monthly cost in USD, or null" },
                  cost_annual: { type: "number", description: "Total annual cost in USD, or null" },
                  renewal_date: { type: "string", description: "Renewal or expiration date in YYYY-MM-DD format, or null" },
                  term_months: { type: "integer", description: "Contract term in months, or null" },
                  billing_cycle: { type: "string", enum: ["monthly", "annual", "quarterly", "multi-year"], description: "Billing cycle" },
                  license_count: { type: "integer", description: "Total number of licenses/seats, or null" },
                  notes: { type: "string", description: "Brief summary of key contract terms" },
                  line_items: {
                    type: "array",
                    description: "Individual products or services listed in the document. Include EVERY line item.",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Product or service name" },
                        quantity: { type: "integer", description: "Quantity or seat count for this item" },
                        monthly_cost: { type: "number", description: "Monthly cost for this item, or null" },
                        annual_cost: { type: "number", description: "Annual cost for this item, or null" },
                        unit_price: { type: "number", description: "Per-unit price if applicable" },
                        description: { type: "string", description: "Brief description of this line item" },
                      },
                      required: ["name"],
                    },
                  },
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

    // Auto-rename the file based on extracted data
    if (extractedData.vendor_name && !delete_after_scan) {
      try {
        const vendor = extractedData.vendor_name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "_");
        const date = extractedData.renewal_date || new Date().toISOString().split("T")[0];
        const ext = file_path.split(".").pop() || "pdf";
        const newFileName = `${vendor}_${date}.${ext}`;
        
        // Update the file name in contract_files table
        await serviceClient
          .from("contract_files")
          .update({ file_name: newFileName })
          .eq("file_path", file_path)
          .eq("user_application_id", user_application_id);
      } catch (renameErr) {
        console.error("Auto-rename failed (non-critical):", renameErr);
      }
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
