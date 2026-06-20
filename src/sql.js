// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────────────────────
export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.site_content (
  id text NOT NULL,
  content jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_content_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.collections (
  id text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  image_url text NOT NULL,
  item_count_label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collections_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.products (
  id text NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL CHECK (price >= 0),
  main_image_url text NOT NULL,
  gallery_image_urls text[] NOT NULL DEFAULT '{}',
  category_label text,
  description text NOT NULL,
  details text[] NOT NULL DEFAULT '{}',
  sizes text[] NOT NULL DEFAULT '{}',
  section text NOT NULL DEFAULT 'general' CHECK (section = ANY (ARRAY['general','new_arrivals','best_sellers'])),
  collection_ids text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_users_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.saved_addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  apartment text,
  city text NOT NULL,
  state text NOT NULL,
  zip_code text NOT NULL,
  country text NOT NULL DEFAULT 'India',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_addresses_pkey PRIMARY KEY (id),
  CONSTRAINT saved_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id)
);

CREATE TABLE IF NOT EXISTS public.order_policies (
  id boolean NOT NULL DEFAULT true CHECK (id = true),
  shipping_amount numeric NOT NULL DEFAULT 15 CHECK (shipping_amount >= 0),
  free_shipping_threshold numeric NOT NULL DEFAULT 200 CHECK (free_shipping_threshold >= 0),
  tax_rate numeric NOT NULL DEFAULT 8 CHECK (tax_rate >= 0),
  automatic_shipping_enabled boolean NOT NULL DEFAULT false,
  shippo_from_name text NOT NULL DEFAULT '',
  shippo_from_company text NOT NULL DEFAULT '',
  shippo_from_street1 text NOT NULL DEFAULT '',
  shippo_from_street2 text NOT NULL DEFAULT '',
  shippo_from_city text NOT NULL DEFAULT '',
  shippo_from_state text NOT NULL DEFAULT '',
  shippo_from_zip text NOT NULL DEFAULT '',
  shippo_from_country text NOT NULL DEFAULT 'IN',
  shippo_from_phone text NOT NULL DEFAULT '',
  shippo_from_email text NOT NULL DEFAULT '',
  shippo_from_is_residential boolean NOT NULL DEFAULT false,
  shippo_parcel_length numeric NOT NULL DEFAULT 10 CHECK (shippo_parcel_length > 0),
  shippo_parcel_width numeric NOT NULL DEFAULT 10 CHECK (shippo_parcel_width > 0),
  shippo_parcel_height numeric NOT NULL DEFAULT 4 CHECK (shippo_parcel_height > 0),
  shippo_parcel_weight numeric NOT NULL DEFAULT 1 CHECK (shippo_parcel_weight > 0),
  shippo_parcel_distance_unit text NOT NULL DEFAULT 'in' CHECK (shippo_parcel_distance_unit = ANY (ARRAY['in','cm'])),
  shippo_parcel_mass_unit text NOT NULL DEFAULT 'lb' CHECK (shippo_parcel_mass_unit = ANY (ARRAY['lb','oz','g','kg'])),
  shippo_label_file_type text NOT NULL DEFAULT 'PDF_4x6' CHECK (shippo_label_file_type = ANY (ARRAY['PNG','PNG_2.3x7.5','PDF','PDF_2.3x7.5','PDF_4x6','PDF_4x8','PDF_A4','PDF_A5','PDF_A6','ZPLII'])),
  active_theme_name text DEFAULT 'default',
  updated_at timestamptz NOT NULL DEFAULT now(),
  show_ticker boolean NOT NULL DEFAULT true,
  section_styles jsonb NOT NULL DEFAULT '{"homeHero":"video"}',
  CONSTRAINT order_policies_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.coupons (
  code text NOT NULL,
  label text NOT NULL,
  coupon_type text NOT NULL CHECK (coupon_type = ANY (ARRAY['universal','one_time'])),
  discount_type text NOT NULL CHECK (discount_type = ANY (ARRAY['percent','amount'])),
  discount_value numeric NOT NULL CHECK (discount_value >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_pkey PRIMARY KEY (code)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id text NOT NULL,
  user_id uuid,
  user_email text NOT NULL,
  status text NOT NULL DEFAULT 'placed' CHECK (status = ANY (ARRAY['placed','packed','in_transit','delivered'])),
  payment_method text NOT NULL CHECK (payment_method = ANY (ARRAY['cod','razorpay'])),
  payment_verified boolean NOT NULL DEFAULT false,
  razorpay_payment_id text,
  coupon_code text,
  shipping_address jsonb NOT NULL,
  totals jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id),
  CONSTRAINT orders_coupon_code_fkey FOREIGN KEY (coupon_code) REFERENCES public.coupons(code)
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  product_id text,
  product_name text NOT NULL,
  product_image text,
  size text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  line_total numeric NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);

CREATE TABLE IF NOT EXISTS public.themes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  colors jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT themes_pkey PRIMARY KEY (id)
);
`;

// ─────────────────────────────────────────────────────────────────────────────
// SEED  — full mock data from uploaded SQL files
// ─────────────────────────────────────────────────────────────────────────────
export const SEED_SQL = `
-- Themes
INSERT INTO public.themes (id, name, label, colors, is_active) VALUES
  ('36c8ea36-0aa5-4100-b0c4-d61c6b9bccd3','crimson','Crimson Elegance','{"muted":"oklch(0.96 0.02 20)","accent":"oklch(0.6 0.15 30)","border":"oklch(0.9 0.05 20)","primary":"oklch(0.5 0.18 25)","secondary":"oklch(0.95 0.03 20)","background":"oklch(0.98 0.01 20)","foreground":"oklch(0.2 0.05 20)","primary_foreground":"oklch(0.98 0.01 20)"}',true),
  ('48234595-c916-4e52-a1d7-5dc489fec14d','golden','Light Golden','{"muted":"oklch(0.88 0.08 70)","accent":"oklch(0.75 0.18 62)","border":"oklch(0.90 0.10 70)","primary":"oklch(0.70 0.18 62)","secondary":"oklch(0.85 0.12 70)","background":"oklch(0.98 0.01 70)","foreground":"oklch(0.25 0.08 50)","primary_foreground":"oklch(0.96 0.12 75)"}',true),
  ('7f33e885-6629-4f6b-8dde-382efa03698c','default','Minimalist White','{"muted":"oklch(0.97 0 0)","accent":"oklch(0.97 0 0)","border":"oklch(0.922 0 0)","primary":"oklch(0.205 0 0)","secondary":"oklch(0.97 0 0)","background":"oklch(0.985 0 0)","foreground":"oklch(0.145 0 0)","primary_foreground":"oklch(0.985 0 0)"}',true),
  ('bcf786ec-a658-4e9f-9115-0067fc313a34','peachy','Peachy Delight','{"muted":"oklch(0.901 0.012 162.023)","accent":"oklch(0.888 0.061 5.752)","border":"oklch(0.85 0.02 0)","primary":"oklch(0.816 0.086 9.042)","secondary":"oklch(0.888 0.061 5.752)","background":"oklch(0.95 0.01 162)","foreground":"oklch(0.35 0.03 0)","primary_foreground":"oklch(0.98 0.01 0)"}',true),
  ('c3f4dba4-17db-47d6-9e84-315425d78e91','midnight','Midnight Dark','{"muted":"oklch(0.2 0.03 240)","accent":"oklch(0.7 0.1 200)","border":"oklch(0.3 0.05 240)","primary":"oklch(0.6 0.15 250)","secondary":"oklch(0.25 0.05 240)","background":"oklch(0.15 0.02 240)","foreground":"oklch(0.98 0.01 240)","primary_foreground":"oklch(0.98 0.01 240)"}',true),
  ('d132bca7-872e-475c-adfc-1f8b2e9e271c','ocean','Ocean Deep','{"muted":"oklch(0.9 0.03 220)","accent":"oklch(0.6 0.12 200)","border":"oklch(0.8 0.06 220)","primary":"oklch(0.5 0.15 220)","secondary":"oklch(0.85 0.05 220)","background":"oklch(0.95 0.02 220)","foreground":"oklch(0.2 0.08 220)","primary_foreground":"oklch(0.98 0.01 220)"}',true),
  ('dab26fe5-31e9-4748-b82a-15d3b91c5af1','forest','Forest Nature','{"muted":"oklch(0.92 0.03 140)","accent":"oklch(0.5 0.12 150)","border":"oklch(0.85 0.05 140)","primary":"oklch(0.4 0.1 140)","secondary":"oklch(0.9 0.05 140)","background":"oklch(0.97 0.01 140)","foreground":"oklch(0.2 0.05 140)","primary_foreground":"oklch(0.98 0.01 140)"}',true),
  ('fd49d578-a0a1-44a9-9d83-93dcec092dc8','lavender','Lavender Mist','{"muted":"oklch(0.94 0.03 290)","accent":"oklch(0.75 0.15 300)","border":"oklch(0.88 0.06 290)","primary":"oklch(0.7 0.12 290)","secondary":"oklch(0.92 0.05 290)","background":"oklch(0.96 0.02 290)","foreground":"oklch(0.3 0.08 290)","primary_foreground":"oklch(0.98 0.01 290)"}',true)
ON CONFLICT (name) DO UPDATE SET label=EXCLUDED.label, colors=EXCLUDED.colors, updated_at=now();

-- Collections
INSERT INTO public.collections (id, name, description, image_url, item_count_label, sort_order) VALUES
  ('contemporary','Contemporary Collection','Modern cuts and innovative styling for the forward-thinking gentleman.','/thudarum-sky-blue-blazer.jpg','10 items',30),
  ('evening','Evening Collection','Luxurious velvet and satin pieces designed to make a statement at formal occasions.','/thudarum-navy-velvet-blazer.jpg','6 items',40),
  ('executive','Executive Collection','Bold, sophisticated pieces for the modern power dresser. Featuring rich textures and commanding colors.','/thudarum-burgundy-evening-suit.jpg','12 items',10),
  ('heritage','Heritage Collection','Classic tailoring with timeless appeal. Traditional patterns reimagined for contemporary elegance.','/thudarum-green-check-blazer.jpg','8 items',20)
ON CONFLICT (id) DO NOTHING;

-- Products
INSERT INTO public.products (id,name,price,main_image_url,gallery_image_urls,category_label,description,details,sizes,section,collection_ids,sort_order,is_active) VALUES
  ('burgundy-blazer-cream-trousers','Burgundy Blazer with Cream Trousers',985.00,'/thudarum-burgundy-blazer-combo.jpg',ARRAY['/thudarum-burgundy-combo-detail.jpg','/thudarum-burgundy-combo-side.jpg'],'Separates','A striking burgundy blazer combination with cream trousers for a polished statement look.',ARRAY['Premium wool construction','Double-breasted design','Gold-tone buttons','Tailored separates'],ARRAY['38','40','42','44','46','48'],'best_sellers',ARRAY['executive','evening'],10,true),
  ('camel-trench-coat','Camel Trench Coat',645.00,'/camel-trench-coat-elegant.jpg',ARRAY['/minimalist-fashion-studio-elegant-clothing.jpg'],'Outerwear','A refined camel trench coat with a versatile silhouette for smart everyday dressing.',ARRAY['Water-resistant cotton blend','Belted waist','Classic storm flap'],ARRAY['S','M','L','XL'],'general',ARRAY['heritage','contemporary'],20,true),
  ('classic-taupe-double-breasted-suit','Classic Taupe Double-Breasted Suit',1289.00,'/thudarum-taupe-suit-hero.jpg',ARRAY['/thudarum-taupe-suit-detail.jpg','/thudarum-taupe-suit-side.jpg'],'Suits','An impeccably tailored double-breasted suit in refined taupe wool with peak lapels and matching trousers.',ARRAY['100% Italian wool','Double-breasted closure','Peak lapels','Complete with trousers'],ARRAY['38','40','42','44','46','48'],'new_arrivals',ARRAY['executive','contemporary'],10,true),
  ('elegant-black-wool-trousers','Elegant Black Wool Trousers',325.00,'/elegant-black-wool-trousers.jpg',ARRAY[],'Trousers','A foundational black wool trouser with a sharp line and versatile formal appeal.',ARRAY['Wool blend','Pressed front crease','Tailored waistband'],ARRAY['30','32','34','36','38'],'general',ARRAY[],30,true),
  ('heritage-green-check-blazer','Heritage Green Check Blazer',895.00,'/thudarum-green-check-blazer.jpg',ARRAY['/thudarum-green-check-detail.jpg','/thudarum-green-check-side.jpg'],'Blazers','A distinguished houndstooth blazer with classic green patterning, refined tailoring, and gold-tone buttons.',ARRAY['Premium wool houndstooth','Double-breasted design','Gold-tone buttons','Made in England'],ARRAY['38','40','42','44','46','48'],'new_arrivals',ARRAY['heritage'],20,true),
  ('luxe-burgundy-evening-suit','Luxe Burgundy Evening Suit',1545.00,'/thudarum-burgundy-evening-suit.jpg',ARRAY['/thudarum-burgundy-suit-detail.jpg','/thudarum-burgundy-suit-side.jpg'],'Suits','A sophisticated burgundy suit designed for elevated evening occasions with a timeless tailored silhouette.',ARRAY['Fine Italian wool','Double-breasted style','Tone-on-tone buttons','Full suit ensemble'],ARRAY['38','40','42','44','46','48'],'new_arrivals',ARRAY['executive','evening'],30,true),
  ('minimalist-white-linen-shirt','Minimalist White Linen Shirt',245.00,'/minimalist-white-linen-shirt-fashion.jpg',ARRAY['/ivory-silk-blouse-minimal.jpg'],'Shirts','A clean white linen shirt designed for effortless layering and warm-weather polish.',ARRAY['Premium linen','Relaxed tailored fit','Breathable finish'],ARRAY['S','M','L','XL'],'general',ARRAY['contemporary'],10,true),
  ('modern-slate-blazer-set','Modern Slate Blazer Set',1095.00,'/thudarum-slate-blazer-set.jpg',ARRAY['/thudarum-slate-blazer-detail.jpg','/thudarum-slate-blazer-side.jpg'],'Separates','A sophisticated slate blazer set that blends timeless tailoring with modern styling.',ARRAY['Premium wool blend','Double-breasted design','Classic buttons','Made in England'],ARRAY['38','40','42','44','46','48'],'best_sellers',ARRAY['contemporary'],40,true),
  ('navy-velvet-double-breasted-jacket','Navy Velvet Double-Breasted Jacket',1195.00,'/thudarum-navy-velvet-blazer.jpg',ARRAY['/thudarum-navy-velvet-detail.jpg','/thudarum-navy-velvet-side.jpg'],'Blazers','A luxurious navy velvet jacket with elevated texture and refined eveningwear presence.',ARRAY['Italian cotton velvet','Double-breasted style','Silver-tone buttons','Evening-ready finish'],ARRAY['38','40','42','44','46','48'],'best_sellers',ARRAY['evening'],20,true),
  ('refined-gray-double-breasted-suit','Refined Gray Double-Breasted Suit',1345.00,'/thudarum-gray-suit-refined.jpg',ARRAY['/thudarum-gray-suit-detail.jpg','/thudarum-gray-suit-side.jpg'],'Suits','A modern gray double-breasted suit with a clean profile and professional finish.',ARRAY['Super 120s wool','Double-breasted closure','Peak lapels','Complete suit'],ARRAY['38','40','42','44','46','48'],'best_sellers',ARRAY['executive','contemporary'],30,true),
  ('sky-blue-textured-blazer','Sky Blue Textured Blazer',795.00,'/thudarum-sky-blue-blazer.jpg',ARRAY['/thudarum-sky-blue-detail.jpg','/thudarum-sky-blue-side.jpg'],'Blazers','A contemporary sky blue blazer with subtle texture, sharp tailoring, and distinctive button details.',ARRAY['Textured wool blend','Double-breasted cut','Gold button details','Made in Italy'],ARRAY['38','40','42','44','46','48'],'new_arrivals',ARRAY['contemporary'],40,true)
ON CONFLICT (id) DO NOTHING;

-- Coupons
INSERT INTO public.coupons (code, label, coupon_type, discount_type, discount_value, active) VALUES
  ('WELCOME10','Welcome 10%','universal','percent',10.00,true)
ON CONFLICT (code) DO NOTHING;

-- Order policies
INSERT INTO public.order_policies (id, shipping_amount, free_shipping_threshold, tax_rate, automatic_shipping_enabled, shippo_from_name, shippo_from_company, shippo_from_street1, shippo_from_street2, shippo_from_city, shippo_from_state, shippo_from_zip, shippo_from_country, shippo_from_phone, shippo_from_email, shippo_from_is_residential, shippo_parcel_length, shippo_parcel_width, shippo_parcel_height, shippo_parcel_weight, shippo_parcel_distance_unit, shippo_parcel_mass_unit, shippo_label_file_type, active_theme_name, show_ticker, section_styles) VALUES
  (true, 15.00, 200.00, 8.00, true, 'FABRICA', 'SPARROW AI SOLUTIONS', '20 W 34th St', 'New York', 'New York', 'NY', '10001', 'US', '8852099490', 'sparrowaisolutions@gmail.com', false, 10.00, 10.00, 4.00, 1.00, 'in', 'lb', 'PDF_4x6', 'default', true, '{"homeHero":"video"}')
ON CONFLICT (id) DO NOTHING;

-- Site content
INSERT INTO public.site_content (id, content) VALUES
  ('site', '{"brandName":"FABRICA","tickerMessages":["FREE SHIPPING ON ORDERS OVER \u20b9200","30-DAY RETURNS","HOST YOUR OWN STORE IN MINUTES"]}'),
  ('home', '{"heroTitle":"Launch Your Store","heroSubtitle":"Discover powerful tools crafted for the modern merchant","heroVideoUrl":"https://www.youtube.com/embed/u9FEg5qur14?autoplay=1&mute=1&loop=1&playlist=u9FEg5qur14&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1","footerTagline":"Contemporary commerce for the independent entrepreneur.","bestSellersTitle":"Best Sellers","collectionsTitle":"Collections","newArrivalsTitle":"New Arrivals"}'),
  ('about', '{"values":[{"title":"Craftsmanship","description":"Every feature is constructed with meticulous attention to detail by skilled engineers who take pride in their work."},{"title":"Quality","description":"We source only the finest open-source tools and frameworks, ensuring reliability and speed in every build."},{"title":"Timelessness","description":"Our designs transcend fleeting trends, offering interfaces that remain elegant and relevant season after season."}],"ctaTitle":"Experience Fabrica","heroTitle":"About Fabrica","storyTitle":"Our Story","valuesTitle":"Our Values","heroImageUrl":"/thudarum-burgundy-evening-suit.jpg","heroSubtitle":"Building seamless commerce tools for the modern entrepreneur","storyImageUrl":"/thudarum-taupe-suit-detail.jpg","ctaDescription":"Discover our latest platform of meticulously crafted storefronts and dashboards designed for the modern merchant.","storyParagraphs":["Founded with a vision to redefine modern e-commerce, Fabrica represents the perfect marriage of powerful infrastructure and intuitive design.","Every feature in our platform is meticulously crafted using proven technology and assembled by engineers who have honed their expertise over decades.","Our storefronts and admin tools are designed for the discerning merchant who appreciates quality, understands branding, and values a platform that will remain powerful and relevant for years to come."]}'),
  ('collections', '{"title":"Collections","description":"Explore our curated collections, each telling a unique story of style, craftsmanship, and modern elegance.","featuredTitle":"Crafted for Excellence","featuredDescription":"Each collection is carefully curated to offer distinctive pieces that complement your personal style."}'),
  ('shop', '{"title":"All Products"}'),
  ('page:contact', '{"body":["Reach out to our support team for help."],"title":"Contact","contact":{"email":"support@fabrica.com","phone":"+91 00000 00000","facebook":"https://facebook.com/fabricahq","whatsapp":"https://wa.me/910000000000","instagram":"https://instagram.com/fabricahq"},"description":"Contact us"}'),
  ('page:privacy',  '{"body":["We respect your privacy and protect your data."],"title":"Privacy Policy","description":"Privacy information"}'),
  ('page:returns',  '{"body":["30-day return policy for unworn items."],"title":"Returns","description":"Returns information"}'),
  ('page:shipping', '{"body":["Complimentary shipping rules are controlled from Admin Policies."],"title":"Shipping","description":"Shipping information"}'),
  ('page:terms',    '{"body":["By using this site, you agree to our terms."],"title":"Terms of Service","description":"Terms information"}')
ON CONFLICT (id) DO UPDATE SET content=EXCLUDED.content, updated_at=now();
`;

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE POLICIES
// ─────────────────────────────────────────────────────────────────────────────
export const STORAGE_POLICIES_SQL = `
INSERT INTO storage.buckets (id, name, public) VALUES ('pic', 'pic', true) ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN CREATE POLICY "pic_select_all" ON storage.objects FOR SELECT USING (bucket_id = 'pic'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pic_insert_all" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'pic'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pic_update_all" ON storage.objects FOR UPDATE USING (bucket_id = 'pic'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pic_delete_all" ON storage.objects FOR DELETE USING (bucket_id = 'pic'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

export const FULL_SQL = `${SCHEMA_SQL}\n${SEED_SQL}\n${STORAGE_POLICIES_SQL}`;
