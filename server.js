
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import compression from "compression";
import ExcelJS from "exceljs";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json({limit: "5mb"}));
app.use(cors());
app.use(compression());

const PORT = process.env.PORT || 3000;
const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP; // e.g. mystore.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN; // Admin API token

// Helper: resolve credentials (env by default, allow dev-time override via headers)
function getCreds(req) {
  return {
    shop: req.header("x-shopify-shop") || SHOPIFY_SHOP,
    token: req.header("x-shopify-token") || SHOPIFY_ACCESS_TOKEN,
  };
}

// Serve static UI
app.use(express.static("public"));

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Fetch products (REST Admin)
app.get("/api/products", async (req, res) => {
  try {
    const { shop, token } = getCreds(req);
    if (!shop || !token) {
      return res.status(400).json({ error: "Missing Shopify credentials." });
    }
    const limit = Math.min(parseInt(req.query.limit || "100"), 250);
    const page_info = req.query.page_info;
    const baseUrl = `https://${shop}/admin/api/2024-07/products.json`;
    const url = new URL(baseUrl);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("fields", [
      "id","title","body_html","vendor","product_type","handle",
      "status","tags","variants","options","images","image"
    ].join(","));
    if (page_info) url.searchParams.set("page_info", page_info);

    const r = await fetch(url.toString(), {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });
    const link = r.headers.get("link") || "";
    const json = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: json.errors || json });
    }
    // Extract pagination cursors from Link header
    const next = /<[^>]+page_info=([^&>]+)[^>]*>; rel="next"/.exec(link)?.[1] || null;
    const prev = /<[^>]+page_info=([^&>]+)[^>]*>; rel="previous"/.exec(link)?.[1] || null;
    res.json({ products: json.products || [], next, prev });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch products." });
  }
});

// Export mapped Amazon template as CSV or XLSX
app.post("/api/export", async (req, res) => {
  try {
    const { products, format = "csv", template = "generic" } = req.body || {};
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "No products provided." });
    }
    const rows = mapToAmazon(products, template);
    const filenameBase = `amazon_export_${template}_${Date.now()}`;

    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("AmazonTemplate");
      sheet.addRow(Object.keys(rows[0]));
      rows.forEach(r => sheet.addRow(Object.values(r)));
      res.setHeader("Content-Disposition", `attachment; filename=\"\${filenameBase}.xlsx\"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      await workbook.xlsx.write(res);
      res.end();
    } else {
      // CSV
      const headers = Object.keys(rows[0]);
      const escape = (v) => {
        if (v == null) return "";
        const s = String(v);
        return (s.includes(",") || s.includes("\"") || s.includes("\n")) ? `"\${s.replace(/"/g,'""')}"` : s;
      };
      const csv = [headers.join(",")].concat(rows.map(r => headers.map(h => escape(r[h])).join(","))).join("\n");
      res.setHeader("Content-Disposition", `attachment; filename=\"\${filenameBase}.csv\"`);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(csv);
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to export." });
  }
});

// Basic field mapping (can be extended per category)
function mapToAmazon(products, template) {
  const externalIdTypeByLen = (code) => {
    if (!code) return "";
    const len = String(code).replace(/\D/g,"").length;
    if (len === 12) return "UPC";
    if (len === 13 || len === 14) return "EAN";
    return ""; // unknown
  };
  const templateProductType = (template || "generic").toLowerCase();

  const rows = [];
  for (const p of products) {
    const images = (p.images || []).map(img => img.src);
    const mainImage = images[0] || (p.image?.src || "");
    const otherImages = images.slice(1, 9); // Amazon allows up to 8 additional
    const vendor = p.vendor || "";
    const description = (p.body_html || "").replace(/<[^>]*>/g, "").trim();
    for (const v of (p.variants || [])) {
      const price = v.price || v.compare_at_price || "";
      const sku = v.sku || `${p.handle}-${v.id}`;
      const qty = (v.inventory_quantity != null) ? v.inventory_quantity : "";
      const barcode = v.barcode || "";
      const brand = vendor || p.vendor || "";
      const row = {
        "item_sku": sku,
        "product_type": templateProductType, // you may set category-specific value later
        "item_name": p.title || "",
        "brand_name": brand,
        "external_product_id": barcode,
        "external_product_id_type": externalIdTypeByLen(barcode),
        "manufacturer": brand,
        "standard_price": price,
        "quantity": qty,
        "update_delete": "Update",
        "part_number": sku,
        "description": description,
        "main_image_url": mainImage,
        "other_image_url1": otherImages[0] || "",
        "other_image_url2": otherImages[1] || "",
        "other_image_url3": otherImages[2] || "",
        "other_image_url4": otherImages[3] || "",
        "other_image_url5": otherImages[4] || "",
        "other_image_url6": otherImages[5] || "",
        "other_image_url7": otherImages[6] || "",
        "other_image_url8": otherImages[7] || "",
        // Variation basics (if present)
        "parentage": (p.variants?.length > 1) ? "child" : "",
        "variation_theme": (p.options?.length ? p.options.map(o => o.name).join("-") : ""),
        "size_name": (v.option1 && (p.options?.[0]?.name || "").toLowerCase().includes("size")) ? v.option1 : "",
        "color_name": (v.option1 && (p.options?.[0]?.name || "").toLowerCase().includes("color")) ? v.option1 : (v.option2 && (p.options?.[1]?.name || "").toLowerCase().includes("color") ? v.option2 : ""),
      };
      rows.push(row);
    }
  }
  // ensure at least one row
  return rows.length ? rows : [{
    "item_sku": "", "product_type": templateProductType, "item_name": "", "brand_name": "",
    "external_product_id": "", "external_product_id_type": "", "manufacturer": "", "standard_price": "",
    "quantity": "", "update_delete": "Update", "part_number": "", "description": "",
    "main_image_url": "", "other_image_url1": "", "other_image_url2": "", "other_image_url3": "",
    "other_image_url4": "", "other_image_url5": "", "other_image_url6": "", "other_image_url7": "",
    "other_image_url8": "", "parentage":"", "variation_theme":"", "size_name":"", "color_name":""
  }];
}

app.listen(PORT, () => {
  console.log(`Shop Sync Bridge clone running on http://localhost:${PORT}`);
});
