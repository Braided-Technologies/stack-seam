import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { file_path, user_application_id, delete_after_scan } = await req.json();
    if (!file_path || !user_application_id) {
      return new Response(JSON.stringify({ error: "file_path and user_application_id are required" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    // Verify user via service-role JWT validation (SUPABASE_ANON_KEY is
    // undefined post-migration; this pattern matches search-tool v10+)
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify org membership (use service client + explicit user ID)
    const { data: orgIdData } = await serviceClient
      .from('user_roles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(r => ({ data: r.data?.organization_id }));
    if (!orgIdData) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check admin status via direct query (no RPC — service client doesn't carry auth.uid())
    const { data: roleRow } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    const isAdmin = roleRow?.role === 'admin' || roleRow?.role === 'platform_admin';
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Download the file from storage (reuse serviceClient from auth)
    const { data: fileData, error: dlError } = await serviceClient.storage
      .from("contracts")
      .download(file_path);

    if (dlError || !fileData) {
      return new Response(JSON.stringify({ error: "Failed to download file: " + (dlError?.message || "unknown") }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Convert file to base64 for multimodal input
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Data = arrayBufferToBase64(arrayBuffer);
    // Detect mime type from extension for the multimodal content block
    const ext = file_path.toLowerCase().split('.').pop() || '';
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      png: 'image/png', webp: 'image/webp', heic: 'image/heic',
      doc: 'application/octet-stream', docx: 'application/octet-stream',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';

    // Use OpenAI gpt-4o for multimodal extraction (replaces Lovable gateway)
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
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
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
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
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("scan-contract error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
