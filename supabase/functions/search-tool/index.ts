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

/** Scrape a URL for meta tags (title, description, icon) */
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

    // Title: prefer og:title > <title>
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
    const titleTag = doc.querySelector("title")?.textContent;
    result.title = ogTitle || titleTag || null;

    // Description: prefer og:description > meta description
    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute("content");
    const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute("content");
    result.description = ogDesc || metaDesc || null;

    // Icon: prefer apple-touch-icon > shortcut icon > favicon
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
    // Validate the caller's JWT using the service role client — doesn't
    // depend on the anon/publishable key being set as an env var. This is
    // the pattern that post-migration functions use reliably.
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

    // ── Handle category update (platform admin only) ──
    if (body.updateCategory && body.appId && body.categoryId) {
      // Check platform admin status directly since we have the validated user.id
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

    // ── Search / scrape flow ──
    const { query, url: vendorUrl } = body;

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return json(req, { error: "Name is required (at least 2 characters)" }, 400);
    }

    // Check for existing match by name (case-insensitive) — reuse the service client
    const { data: existing } = await serviceClient
      .from("applications")
      .select("*, categories(name)")
      .ilike("name", `%${query.trim()}%`);

    if (existing && existing.length > 0) {
      return json(req, { found: true, existing: true, applications: existing });
    }

    // Scrape vendor URL if provided
    let scraped: { title: string | null; description: string | null; icon: string | null } = {
      title: null,
      description: null,
      icon: null,
    };

    if (vendorUrl && typeof vendorUrl === "string") {
      let normalizedUrl = vendorUrl.trim();
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = "https://" + normalizedUrl;
      }
      scraped = await scrapeMeta(normalizedUrl);
    }

    // Return scraped data for the user to confirm before inserting
    return json(req, {
      found: false,
      scraped: {
        name: scraped.title || query.trim(),
        description: scraped.description || null,
        icon: scraped.icon || null,
        vendor_url: vendorUrl?.trim() || null,
      },
    });
  } catch (e) {
    console.error("search-tool error:", e);
    return json(req, { error: "An internal error occurred" }, 500);
  }
});
