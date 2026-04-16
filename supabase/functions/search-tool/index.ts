import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

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

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/**
 * Post-process the raw scraped title/description via gpt-4o-mini so the new
 * tool entry matches the concise house style (short product name + 3-8 word
 * description) instead of dumping the vendor's full marketing tagline.
 * Falls back to the raw scrape if the API call fails.
 */
async function cleanScrapedMeta(
  rawName: string,
  rawDesc: string,
  url: string,
  openaiKey: string,
): Promise<{ name: string; description: string }> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You normalize scraped vendor website metadata into concise catalog entries.

RULES:
- "name" = the short product/brand name only. Strip taglines, pipes, dashes, and marketing filler.
  Examples: "Frontier AI LLMs, assistants, agents, services | Mistral AI" -> "Mistral AI"
  "Drata: Automate SOC 2, HIPAA, ISO 27001 Compliance" -> "Drata"
  "Pipedrive - The #1 Easy to Use CRM" -> "Pipedrive"
- "description" = 3 to 8 words, factual, no marketing fluff.
  Examples: "AI assistant by Anthropic", "Compliance automation platform",
  "Sales CRM for small teams", "vCIO and QBR platform"
- If the scraped data is empty or useless, infer from the URL hostname.`,
          },
          {
            role: "user",
            content: `URL: ${url}\nScraped title: ${rawName || "(empty)"}\nScraped description: ${rawDesc || "(empty)"}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "normalize",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Short product or brand name (usually 1-3 words)" },
                description: { type: "string", description: "3-8 word factual description in house style" },
              },
              required: ["name", "description"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "normalize" } },
      }),
    });
    if (!res.ok) {
      console.warn("cleanScrapedMeta: non-OK", res.status);
      return { name: rawName, description: rawDesc };
    }
    const data = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return { name: rawName, description: rawDesc };
    const parsed = JSON.parse(args);
    return {
      name: (parsed.name || rawName || "").trim(),
      description: (parsed.description || rawDesc || "").trim(),
    };
  } catch (e) {
    console.warn("cleanScrapedMeta exception:", (e as Error).message);
    return { name: rawName, description: rawDesc };
  }
}

async function scrapeMeta(url: string) {
  const result: { title: string | null; description: string | null; icon: string | null } = {
    title: null,
    description: null,
    icon: null,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StackSeam/1.0)",
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!resp.ok) return result;

    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) return result;

    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
    const titleTag = doc.querySelector("title")?.textContent;
    result.title = ogTitle || titleTag || null;

    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute("content");
    const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute("content");
    const rawDesc = ogDesc || metaDesc || null;
    if (rawDesc) {
      const trimmed = rawDesc.trim().replace(/\s+/g, " ");
      if (trimmed.length <= 280) {
        result.description = trimmed;
      } else {
        const cut = trimmed.slice(0, 280);
        const lastSpace = cut.lastIndexOf(" ");
        result.description = (lastSpace > 200 ? cut.slice(0, lastSpace) : cut).trimEnd() + "\u2026";
      }
    }

    const appleIcon = doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href");
    const shortcutIcon = doc.querySelector('link[rel="shortcut icon"]')?.getAttribute("href");
    const icon = doc.querySelector('link[rel="icon"]')?.getAttribute("href");
    const rawIcon = appleIcon || shortcutIcon || icon || null;

    if (rawIcon) {
      try {
        result.icon = new URL(rawIcon, url).href;
      } catch {
        result.icon = rawIcon;
      }
    }
  } catch (e) {
    console.warn("Scrape failed:", e.message);
  }

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(req, { error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {
      data: { user },
      error: authError,
    } = await serviceClient.auth.getUser(jwt);
    if (authError || !user) {
      console.error("search-tool auth failed:", authError?.message || "no user");
      return json(req, { error: "Unauthorized" }, 401);
    }

    const body = await req.json();

    if (body.updateCategory && body.appId && body.categoryId) {
      const { data: roleRow } = await serviceClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "platform_admin")
        .maybeSingle();
      if (!roleRow) return json(req, { error: "Forbidden" }, 403);

      const { error } = await serviceClient
        .from("applications")
        .update({ category_id: body.categoryId })
        .eq("id", body.appId);
      if (error) throw error;
      return json(req, { success: true });
    }

    const { query, url: vendorUrl } = body;

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return json(req, { error: "Name is required (at least 2 characters)" }, 400);
    }

    const { data: existing } = await serviceClient
      .from("applications")
      .select("*, categories(name)")
      .ilike("name", `%${query.trim()}%`);

    if (existing && existing.length > 0) {
      return json(req, { found: true, existing: true, applications: existing });
    }

    let scraped: { title: string | null; description: string | null; icon: string | null } = {
      title: null,
      description: null,
      icon: null,
    };
    let normalizedUrl = "";

    if (vendorUrl && typeof vendorUrl === "string") {
      normalizedUrl = vendorUrl.trim();
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = "https://" + normalizedUrl;
      }
      scraped = await scrapeMeta(normalizedUrl);
    }

    // Post-process through gpt-4o-mini so the new entry matches the house
    // style (short name, 3-8 word description). Falls back to raw scrape if
    // the OpenAI call fails or no key is configured.
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    let cleanName: string = scraped.title || query.trim();
    let cleanDesc: string | null = scraped.description || null;
    if (openaiKey && normalizedUrl && (scraped.title || scraped.description)) {
      const cleaned = await cleanScrapedMeta(
        scraped.title || query.trim(),
        scraped.description || "",
        normalizedUrl,
        openaiKey,
      );
      if (cleaned.name) cleanName = cleaned.name;
      if (cleaned.description) cleanDesc = cleaned.description;
    }

    return json(req, {
      found: false,
      scraped: {
        name: cleanName,
        description: cleanDesc,
        icon: scraped.icon || null,
        vendor_url: vendorUrl?.trim() || null,
      },
    });
  } catch (e) {
    console.error("search-tool error:", e);
    return json(req, { error: "An internal error occurred" }, 500);
  }
});
