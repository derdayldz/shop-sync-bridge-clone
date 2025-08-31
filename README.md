
# Shop Sync Bridge – Clone (Shopify → Amazon CSV/XLSX)

Bu proje, Shopify mağazandaki ürünleri çekip seçim yaptıktan sonra Amazon'a uygun CSV/XLSX çıktı üretir.

## Hızlı Başlangıç

1) **İndir & Kur**
```bash
npm install
npm run dev
```
> İlk çalıştırmadan önce `.env.example` dosyasını `.env` olarak kopyalayıp kendi bilgilerinle doldur.

```env
SHOPIFY_SHOP=yourstore.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxx
PORT=3000
```

2) **Tarayıcıda aç**  
`http://localhost:3000` → Shop domain ve token gir → **Bağlan ve Ürünleri Çek**

3) **Ürün seç** → **Amazon Şablonu** ve **Format** seç → **Dışa Aktar**.

## Notlar

- Admin API versiyonu `2024-07`. İstersen güncelleyebilirsin.
- CSV/XLSX alanları "generic" şablonuna göre temel sütunları içerir:
  - item_sku, product_type, item_name, brand_name, external_product_id, external_product_id_type,
    manufacturer, standard_price, quantity, update_delete, part_number, description, main_image_url,
    other_image_url1..8, parentage, variation_theme, size_name, color_name
- Kategoriye özel şablonlar için `mapToAmazon()` fonksiyonunu genişletebilirsin.
- Canlı ortamda Shopify token'ı **sunucu tarafında** `.env` içinde tut; istemciye göstermemelisin.

## Güvenlik
- Bu demo geliştirme amaçlıdır. Üretimde rate limit, retry, logging, hata yönetimi ve kullanıcı yetkilendirmesi ekleyin.

