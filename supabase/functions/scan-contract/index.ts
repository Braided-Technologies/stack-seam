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

    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(jwt);
    if (authError || !user) {
      console.error("scan-contract auth failed:", authError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify org + admin in one query
    const { data: roleRow, error: roleErr } = await serviceClient
      .from('user_roles')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (roleErr) {
      console.error("user_roles query failed:", roleErr.message);
      return new Response(JSON.stringify({ error: "Failed to verify role" }), {
        status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (!roleRow || (roleRow.role !== 'admin' && roleRow.role !== 'platform_admin')) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: fileData, error: dlError } = await serviceClient.storage
      .from("contracts")
      .download(file_path);

    if (dlError || !fileData) {
      console.error("File download failed:", dlError?.message);
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

    const arrayBuffer = await fileData.arrayBuffer();
    const base64Data = arrayBufferToBase64(arrayBuffer);
    const ext = file_path.toLowerCase().split('.').pop() || '';
    const isPdf = ext === 'pdf';
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      png: 'image/png', webp: 'image/webp', heic: 'image/heic',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';

    // PDFs use the file content type; images use image_url
    const fileContent = isPdf
      ? { type: "file", file: { filename: file_path.split('/').pop() || 'document.pdf', file_data: `data:${mimeType};base64,${base64Data}` } }
      : { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } };

    console.log(`[scan-contract] Sending ${ext} (${(arrayBuffer.byteLength / 1024).toFixed(0)}KB) to gpt-4o`);

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
            content: "You are a contract/invoice/receipt data extraction assistant. Extract ALL structured data including every individual line item. Be thorough. Return ONLY the tool call.",
          },
          {
            role: "user",
            content: [
              fileContent,
              {
                type: "text",
                text: "Extract all fields and every line item from this document. If a field is not found, use null.",
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_contract_data",
              description: "Extract structured data from a contract, invoice, or receipt",
              parameters: {
                type: "object",
                properties: {
                  vendor_name: { type: "string", description: "The vendor or provider company name" },
                  cost_monthly: { type: "number", description: "Total monthly cost in USD, or null" },
                  cost_annual: { type: "number", description: "Total annual cost in USD, or null" },
                  renewal_date: { type: "string", description: "Renewal or expiration date in YYYY-MM-DD format, or null" },
                  start_date: { type: "string", description: "Contract or subscription start date in YYYY-MM-DD format, or null" },
                  term_months: { type: "integer", description: "Contract commitment length in months. Use 12 for an annual term, 24/36/… for multi-year, and null for month-to-month." },
                  billing_cycle: { type: "string", enum: ["monthly", "annual", "multi-year", "other"], description: "Billing cadence. Pick the best match; use 'other' for anything unusual." },
                  license_count: { type: "integer", description: "Total number of licenses/seats, or null" },
                  notes: { type: "string", description: "Brief summary of key terms or charges" },
                  line_items: {
                    type: "array",
                    description: "Individual products or services listed. Include EVERY line item.",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: "integer" },
                        monthly_cost: { type: "number" },
                        annual_cost: { type: "number" },
                        unit_price: { type: "number" },
                        description: { type: "string" },
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
      console.error("OpenAI error:", aiResponse.status, errText.slice(0, 500));
      return new Response(JSON.stringify({ error: `AI extraction failed (${aiResponse.status})` }), {
        status: aiResponse.status === 429 ? 429 : 500,
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

    if (extractedData.vendor_name && !delete_after_scan) {
      try {
        const vendor = extractedData.vendor_name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "_");
        const date = extractedData.renewal_date || new Date().toISOString().split("T")[0];
        const fileExt = file_path.split(".").pop() || "pdf";
        const newFileName = `${vendor}_${date}.${fileExt}`;

        await serviceClient
          .from("contract_files")
          .update({ file_name: newFileName })
          .eq("file_path", file_path)
          .eq("user_application_id", user_application_id);
      } catch (renameErr) {
        console.error("Auto-rename failed:", renameErr);
      }
    }

    if (delete_after_scan) {
      await serviceClient.storage.from("contracts").remove([file_path]);
      await serviceClient.from("contract_files").delete().eq("file_path", file_path);
    }

    return new Response(JSON.stringify({ success: true, extracted: extractedData, file_deleted: !!delete_after_scan }), {
      status: 200,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("scan-contract error:", err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
