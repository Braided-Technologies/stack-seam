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

// Vendor marketing pages (especially Cloudflare-fronted ones like n-able.com)
// block obvious bot UAs. Pretending to be a recent Chrome desktop dodges the
// easy bot filters without triggering JS-challenge pages.
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

function isChallengePage(html: string): boolean {
  const head = html.slice(0, 4000).toLowerCase();
  return (
    (head.includes("cloudflare") && head.includes("challenge")) ||
    head.includes("just a moment") ||
    head.includes("attention required") ||
    head.includes("you have been blocked") ||
    head.includes("cf-browser-verification") ||
    head.includes("ddos protection") ||
    head.includes("enable javascript and cookies")
  );
}

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
            content: `You normalize vendor website metadata into concise catalog entries.

RULES:
- "name" = the short product/brand name only. Strip taglines, pipes, dashes, and marketing filler.
  Examples: "Frontier AI LLMs, assistants, agents, services | Mistral AI" -> "Mistral AI"
  "Drata: Automate SOC 2, HIPAA, ISO 27001 Compliance" -> "Drata"
  "Pipedrive - The #1 Easy to Use CRM" -> "Pipedrive"
  "N-able Cove Data Protection | Backup for SaaS, Servers, and Workstations" -> "Cove Data Protection"
- "description" = 3 to 8 words, factual, no marketing fluff.
  Examples: "AI assistant by Anthropic", "Compliance automation platform",
  "Sales CRM for small teams", "vCIO and QBR platform"
- If the scraped data is empty or useless, infer the product name and
  description from the URL path and hostname. Common MSP/IT tools in
  particular — most vendors have a clear product URL structure.`,
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
  const result: { title: string | null; description: string | null; icon: string | null; blocked: boolean } = {
    title: null,
    description: null,
    icon: null,
    blocked: false,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.warn(`scrapeMeta: HTTP ${resp.status} for ${url}`);
      return result;
    }

    const html = await resp.text();
    if (html.length < 200 || isChallengePage(html)) {
      console.warn(`scrapeMeta: challenge/short-page for ${url} (len=${html.length})`);
      result.blocked = true;
      return result;
    }
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) return result;

    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
    const twitterTitle = doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content");
    const titleTag = doc.querySelector("title")?.textContent;
    const h1 = doc.querySelector("h1")?.textContent;
    result.title = (ogTitle || twitterTitle || titleTag || h1 || null)?.trim() || null;

    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute("content");
    const twitterDesc = doc.querySelector('meta[name="twitter:description"]')?.getAttribute("content");
    const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute("content");
    const rawDesc = ogDesc || twitterDesc || metaDesc || null;
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
    console.warn("scrapeMeta exception:", (e as Error).message);
  }

  return result;
}

// Google's public favicon service — reliable fallback when we can't parse
// the page's own icon link (bot-blocked pages, SPA shells, etc.).
function googleFaviconUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`;
  } catch {
    return null;
  }
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

    let scraped: { title: string | null; description: string | null; icon: string | null; blocked: boolean } = {
      title: null,
      description: null,
      icon: null,
      blocked: false,
    };
    let normalizedUrl = "";

    if (vendorUrl && typeof vendorUrl === "string") {
      normalizedUrl = vendorUrl.trim();
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = "https://" + normalizedUrl;
      }
      scraped = await scrapeMeta(normalizedUrl);
    }

    // Always run cleanScrapedMeta when we have a URL + OpenAI, so that
    // pages that block bots (empty scrape) still get a sensible name/
    // description inferred from the URL. The model has the RULES prompt
    // for this fallback case.
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    let cleanName: string = scraped.title || query.trim();
    let cleanDesc: string | null = scraped.description || null;
    if (openaiKey && normalizedUrl) {
      const cleaned = await cleanScrapedMeta(
        scraped.title || query.trim(),
        scraped.description || "",
        normalizedUrl,
        openaiKey,
      );
      if (cleaned.name) cleanName = cleaned.name;
      if (cleaned.description) cleanDesc = cleaned.description;
    }

    // Favicon fallback: if we couldn't parse the page's own link, use
    // Google's public favicon service as a last resort.
    const icon = scraped.icon || (normalizedUrl ? googleFaviconUrl(normalizedUrl) : null);

    return json(req, {
      found: false,
      scraped: {
        name: cleanName,
        description: cleanDesc,
        icon,
        vendor_url: vendorUrl?.trim() || null,
        // Surfaced for debug/UX: whether the page blocked our scraper.
        // Frontend can optionally show a hint like "Site blocked metadata read;
        // inferred from URL — please verify."
        blocked: scraped.blocked,
      },
    });
  } catch (e) {
    console.error("search-tool error:", e);
    return json(req, { error: "An internal error occurred" }, 500);
  }
});
