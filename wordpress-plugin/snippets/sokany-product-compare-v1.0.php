/**
 * Snippet Name: SOKANY Product Compare v1.0
 * Description: مقارنة منتجات على Woo بنفس تجربة Next (أيقونة أعلى الصفحة + عداد + أزرار إضافة + صفحة مقارنة).
 *
 * Code Snippets:
 * - Do NOT paste a <?php opening tag
 * - Run snippet: Only run on site front-end
 * - Activate
 * - بعد أول تفعيل: Settings -> Permalinks -> Save مرة واحدة لتفعيل /compare-products/
 *
 * Source: wordpress-plugin/snippets/sokany-product-compare-v1.0.php
 * Does NOT touch Next.js / Vercel storefront.
 */

if (!defined('ABSPATH')) {
    exit;
}

const SOKANY_CMP_STORAGE_KEY = 'sokany-wp-compare-v1';
const SOKANY_CMP_MAX_ITEMS = 4;
const SOKANY_CMP_PAGE_SLUG = 'compare-products';

function sokany_cmp_is_woo_ready(): bool {
    return class_exists('WooCommerce') && function_exists('wc_get_product');
}

function sokany_cmp_is_compare_page(): bool {
    $query_match = (bool) get_query_var('sokany_compare');
    if ($query_match) {
        return true;
    }

    $path = wp_parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
    $path = is_string($path) ? trim($path, '/') : '';
    return $path === SOKANY_CMP_PAGE_SLUG;
}

add_action('init', function () {
    add_rewrite_rule('^' . SOKANY_CMP_PAGE_SLUG . '/?$', 'index.php?sokany_compare=1', 'top');
});

add_filter('query_vars', function (array $vars): array {
    $vars[] = 'sokany_compare';
    return $vars;
});

add_action('rest_api_init', function () {
    register_rest_route('sokany-compare/v1', '/products', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'sokany_cmp_rest_products',
        'permission_callback' => '__return_true',
    ]);
});

function sokany_cmp_rest_products(WP_REST_Request $request) {
    if (!sokany_cmp_is_woo_ready()) {
        return new WP_Error('sokany_woo_missing', 'WooCommerce غير مفعّل.', ['status' => 503]);
    }

    $ids_raw = (string) $request->get_param('ids');
    if ($ids_raw === '') {
        return rest_ensure_response(['products' => []]);
    }

    $ids = array_values(array_unique(array_filter(array_map('absint', explode(',', $ids_raw)))));
    if (empty($ids)) {
        return rest_ensure_response(['products' => []]);
    }
    $ids = array_slice($ids, 0, SOKANY_CMP_MAX_ITEMS);

    $products = [];
    foreach ($ids as $id) {
        $product = wc_get_product($id);
        if (!$product instanceof WC_Product || !$product->is_visible()) {
            continue;
        }

        $products[] = [
            'id' => $product->get_id(),
            'name' => $product->get_name(),
            'slug' => $product->get_slug(),
            'url' => get_permalink($product->get_id()),
            'image' => wp_get_attachment_image_url($product->get_image_id(), 'medium') ?: wc_placeholder_img_src('medium'),
            'price' => wp_strip_all_tags($product->get_price_html() ?: wc_price((float) $product->get_price())),
            'specs' => sokany_cmp_collect_specs($product),
        ];
    }

    // Keep incoming order.
    usort($products, function (array $a, array $b) use ($ids): int {
        return array_search($a['id'], $ids, true) <=> array_search($b['id'], $ids, true);
    });

    return rest_ensure_response(['products' => $products]);
}

function sokany_cmp_collect_specs(WC_Product $product): array {
    $specs = [];

    foreach ($product->get_attributes() as $attribute) {
        if (!$attribute instanceof WC_Product_Attribute) {
            continue;
        }
        $name = wc_attribute_label($attribute->get_name(), $product);
        $value = '';
        if ($attribute->is_taxonomy()) {
            $terms = wc_get_product_terms($product->get_id(), $attribute->get_name(), ['fields' => 'names']);
            $value = is_array($terms) ? implode('، ', array_filter($terms)) : '';
        } else {
            $value = implode('، ', array_filter(array_map('trim', $attribute->get_options())));
        }
        if ($name !== '' && $value !== '') {
            $specs[$name] = $value;
        }
    }

    // Parse description bullet lines like "القدرة: 2200W".
    $raw = wp_strip_all_tags((string) $product->get_short_description());
    if ($raw === '') {
        $raw = wp_strip_all_tags((string) $product->get_description());
    }
    if ($raw !== '') {
        $lines = preg_split('/\r\n|\r|\n/u', $raw) ?: [];
        foreach ($lines as $line) {
            $line = trim((string) $line);
            if ($line === '' || mb_strlen($line) > 120) {
                continue;
            }
            if (!preg_match('/^([^:：]{2,40})\s*[:：]\s*(.{1,80})$/u', $line, $m)) {
                continue;
            }
            $k = trim($m[1]);
            $v = trim($m[2]);
            if ($k !== '' && $v !== '' && !isset($specs[$k])) {
                $specs[$k] = $v;
            }
        }
    }

    return $specs;
}

add_action('template_redirect', function () {
    if (!sokany_cmp_is_compare_page()) {
        return;
    }
    status_header(200);
    nocache_headers();
    echo sokany_cmp_render_compare_page();
    exit;
}, 1);

function sokany_cmp_render_compare_page(): string {
    $shop_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : home_url('/shop');
    $rest_url = esc_url_raw(rest_url('sokany-compare/v1/products'));
    $home_url = home_url('/');
    ob_start();
    ?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
  <meta charset="<?php bloginfo('charset'); ?>" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>مقارنة المنتجات</title>
  <?php wp_head(); ?>
</head>
<body class="sokany-cmp-page" dir="rtl">
  <main class="sokany-cmp-wrap">
    <div class="sokany-cmp-inner">
      <p class="sokany-cmp-kicker">مقارنة المنتجات</p>
      <h1 class="sokany-cmp-title">قارن بين المنتجات</h1>
      <p class="sokany-cmp-sub">اختر منتجات من المتجر، ثم راجع المواصفات جنبًا إلى جنب.</p>

      <div id="sokany-cmp-app"
           data-storage-key="<?php echo esc_attr(SOKANY_CMP_STORAGE_KEY); ?>"
           data-max-items="<?php echo esc_attr((string) SOKANY_CMP_MAX_ITEMS); ?>"
           data-rest-url="<?php echo esc_attr($rest_url); ?>"
           data-shop-url="<?php echo esc_url($shop_url); ?>">
      </div>

      <p class="sokany-cmp-back"><a href="<?php echo esc_url($home_url); ?>">العودة للرئيسية</a></p>
    </div>
  </main>
  <?php wp_footer(); ?>
</body>
</html>
    <?php
    return (string) ob_get_clean();
}

add_action('wp_enqueue_scripts', function () {
    if (!sokany_cmp_is_woo_ready()) {
        return;
    }

    wp_register_style('sokany-cmp-style', false, [], '1.0.0');
    wp_enqueue_style('sokany-cmp-style');
    wp_add_inline_style('sokany-cmp-style', sokany_cmp_css());

    wp_register_script('sokany-cmp-script', false, [], '1.0.0', true);
    wp_enqueue_script('sokany-cmp-script');
    wp_add_inline_script('sokany-cmp-script', sokany_cmp_js(), 'after');
}, 30);

function sokany_cmp_css(): string {
    return <<<'CSS'
:root{
  --cmp-gold:#daff00;
  --cmp-gold-dark:#c1e200;
  --cmp-ink:#0a0a0a;
  --cmp-muted:#61616d;
  --cmp-border:rgba(0,0,0,.1);
  --cmp-bg:#fff;
}
.sokany-cmp-floating{
  position:fixed;top:96px;left:14px;z-index:99998;
  display:inline-flex;align-items:center;justify-content:center;
  width:44px;height:44px;border-radius:999px;border:1px solid var(--cmp-border);
  background:#fff;color:var(--cmp-ink);text-decoration:none;
  box-shadow:0 6px 18px rgba(0,0,0,.12);
}
.sokany-cmp-floating:hover{background:var(--cmp-gold);}
.sokany-cmp-floating svg{width:20px;height:20px}
.sokany-cmp-count{
  position:absolute;right:-4px;top:-4px;
  min-width:18px;height:18px;padding:0 4px;border-radius:999px;
  background:#000;color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center;
}
.sokany-cmp-btn{
  display:inline-flex;align-items:center;gap:8px;margin-top:10px;
  border:1px solid var(--cmp-border);border-radius:999px;background:#fff;color:#111;
  padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;
}
.sokany-cmp-btn:hover,.sokany-cmp-btn.is-active{background:var(--cmp-gold);}
.sokany-cmp-btn .cmp-order{
  display:inline-flex;align-items:center;justify-content:center;
  width:18px;height:18px;border-radius:999px;background:#000;color:#fff;font-size:10px;
}
.sokany-cmp-wrap{padding:32px 12px 50px;background:#f5f6f7;min-height:100vh}
.sokany-cmp-inner{max-width:1200px;margin:0 auto}
.sokany-cmp-kicker{color:#6d6d74;font-size:13px;font-weight:700}
.sokany-cmp-title{margin:6px 0 8px;font-size:34px;line-height:1.2}
.sokany-cmp-sub{margin:0 0 20px;color:#666;line-height:1.8}
.cmp-empty{background:#fff;border:1px solid var(--cmp-border);border-radius:22px;padding:26px;text-align:center}
.cmp-empty a{display:inline-flex;margin-top:12px;background:#000;color:#fff;border-radius:999px;padding:10px 18px;text-decoration:none}
.cmp-loading{background:#fff;border:1px solid var(--cmp-border);border-radius:22px;padding:16px;color:#555}
.cmp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;background:#fff;border:1px solid var(--cmp-border);border-radius:22px;padding:18px;margin-bottom:16px}
.cmp-card{text-align:center}
.cmp-thumb{width:120px;height:120px;object-fit:contain;background:#fafafa;border-radius:16px;padding:8px}
.cmp-name{font-weight:700;font-size:14px;line-height:1.6;min-height:44px}
.cmp-price{font-weight:800}
.cmp-remove{border:1px solid var(--cmp-border);border-radius:999px;background:#fff;padding:7px 12px;font-size:12px;cursor:pointer}
.cmp-table-wrap{overflow:auto;background:#fff;border:1px solid var(--cmp-border);border-radius:22px;padding:14px}
.cmp-table{width:100%;border-collapse:collapse;table-layout:fixed;min-width:680px}
.cmp-table th,.cmp-table td{padding:10px 8px;border-bottom:1px solid #efefef;font-size:13px}
.cmp-table th{color:#555;font-weight:800}
.cmp-attr{text-align:right;color:#666;font-weight:700;width:180px}
.cmp-val{text-align:center;font-weight:700;color:#111}
.cmp-back{text-align:center;margin-top:16px}
.cmp-back a{color:#555}
@media (max-width:900px){
  .sokany-cmp-floating{top:auto;bottom:78px}
}
CSS;
}

function sokany_cmp_js(): string {
    $compare_url = home_url('/' . SOKANY_CMP_PAGE_SLUG . '/');
    $max_items = (int) SOKANY_CMP_MAX_ITEMS;
    return "(function(){\n" .
      "var KEY='" . esc_js(SOKANY_CMP_STORAGE_KEY) . "';\n" .
      "var MAX=" . $max_items . ";\n" .
      "var COMPARE_URL='" . esc_js($compare_url) . "';\n" .
      "function read(){try{var r=localStorage.getItem(KEY);var a=JSON.parse(r||'[]');return Array.isArray(a)?a.filter(Boolean).map(Number):[]}catch(e){return[];}}\n" .
      "function write(list){try{localStorage.setItem(KEY,JSON.stringify(list.slice(0,MAX)));}catch(e){};notify();}\n" .
      "function toggle(id){id=Number(id);if(!id)return;var list=read();var i=list.indexOf(id);if(i>=0){list.splice(i,1);}else{if(list.length>=MAX){alert('يمكن مقارنة حتى '+MAX+' منتجات فقط.');return;}list.push(id);}write(list);refreshButtons();}\n" .
      "function notify(){var list=read();document.querySelectorAll('.sokany-cmp-count').forEach(function(el){el.textContent=list.length;el.style.display=list.length?'inline-block':'none';});document.dispatchEvent(new CustomEvent('sokany-cmp-update',{detail:{list:list}}));}\n" .
      "function refreshButtons(){var list=read();document.querySelectorAll('[data-sokany-compare-btn]').forEach(function(btn){var id=Number(btn.getAttribute('data-product-id'));var idx=list.indexOf(id);var active=idx>=0;btn.classList.toggle('is-active',active);var textEl=btn.querySelector('.cmp-text');if(textEl){textEl.textContent=active?'إزالة من المقارنة':'إضافة إلى المقارنة';}var orderEl=btn.querySelector('.cmp-order');if(orderEl){if(active){orderEl.textContent=String(idx+1);orderEl.style.display='inline-flex';}else{orderEl.style.display='none';}}});}\n" .
      "function injectFloating(){if(document.querySelector('.sokany-cmp-floating'))return;var a=document.createElement('a');a.href=COMPARE_URL;a.className='sokany-cmp-floating';a.setAttribute('aria-label','مقارنة المنتجات');a.innerHTML='<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path></svg><span class=\"sokany-cmp-count\" style=\"display:none\">0</span>';document.body.appendChild(a);}\n" .
      "function injectBtns(){document.querySelectorAll('.product, li.product, .summary').forEach(function(box){if(box.querySelector('[data-sokany-compare-btn]'))return;var pid=box.getAttribute('data-product_id')||box.getAttribute('data-product-id')||box.querySelector('[name=\"add-to-cart\"]')?.value;pid=Number(pid);if(!pid)return;var btn=document.createElement('button');btn.type='button';btn.className='sokany-cmp-btn';btn.setAttribute('data-sokany-compare-btn','1');btn.setAttribute('data-product-id',String(pid));btn.innerHTML='<span class=\"cmp-text\">إضافة إلى المقارنة</span><span class=\"cmp-order\" style=\"display:none\"></span>';btn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();toggle(pid);});var anchor=box.querySelector('.button, .add_to_cart_button, .single_add_to_cart_button')||box.querySelector('h2, .woocommerce-loop-product__title, .product_title');if(anchor&&anchor.parentNode){anchor.parentNode.insertBefore(btn,anchor.nextSibling);} });}\n" .
      "function renderComparePage(){var app=document.getElementById('sokany-cmp-app');if(!app)return;var list=read();var shop=app.getAttribute('data-shop-url')||'/shop/';if(list.length<2){app.innerHTML='<div class=\"cmp-empty\"><p>اختر منتجين على الأقل للمقارنة</p><a href=\"'+shop+'\">تصفح المتجر</a></div>';return;}var rest=app.getAttribute('data-rest-url')||'';app.innerHTML='<div class=\"cmp-loading\">جاري تحميل بيانات المقارنة...</div>';fetch(rest+'?ids='+list.join(','),{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(payload){var products=(payload&&payload.products)||[];if(!products.length){app.innerHTML='<div class=\"cmp-empty\"><p>تعذر تحميل بيانات المنتجات المختارة.</p></div>';return;}var cards='<div class=\"cmp-grid\">'+products.map(function(p,i){return '<div class=\"cmp-card\"><div><span class=\"cmp-order\" style=\"display:inline-flex\">'+(i+1)+'</span></div><a href=\"'+p.url+'\"><img class=\"cmp-thumb\" src=\"'+p.image+'\" alt=\"'+(p.name||'')+'\"></a><p class=\"cmp-name\">'+(p.name||'')+'</p><p class=\"cmp-price\">'+(p.price||'')+'</p><button class=\"cmp-remove\" data-rm=\"'+p.id+'\">إزالة</button></div>';}).join('')+'</div>';\n" .
      "var attrs=[];var seen={};products.forEach(function(p){var specs=p.specs||{};Object.keys(specs).forEach(function(k){if(!seen[k]){seen[k]=1;attrs.push(k);}});});\n" .
      "var head='<tr><th class=\"cmp-attr\">الخاصية</th>'+products.map(function(_,i){return '<th>منتج '+(i+1)+'</th>';}).join('')+'</tr>';\n" .
      "var rows=attrs.map(function(a){var cols=products.map(function(p){var v=(p.specs&&p.specs[a])?p.specs[a]:'—';return '<td class=\"cmp-val\">'+v+'</td>';}).join('');return '<tr><td class=\"cmp-attr\">'+a+'</td>'+cols+'</tr>';}).join('');\n" .
      "if(!rows){rows='<tr><td class=\"cmp-attr\">المواصفات</td><td class=\"cmp-val\" colspan=\"'+products.length+'\">لا توجد مواصفات متاحة.</td></tr>';}\n" .
      "app.innerHTML=cards+'<div class=\"cmp-table-wrap\"><table class=\"cmp-table\"><thead>'+head+'</thead><tbody>'+rows+'</tbody></table></div>';\n" .
      "app.querySelectorAll('[data-rm]').forEach(function(btn){btn.addEventListener('click',function(){var id=Number(btn.getAttribute('data-rm'));var arr=read().filter(function(x){return x!==id;});write(arr);renderComparePage();});});\n" .
      "}).catch(function(){app.innerHTML='<div class=\"cmp-empty\"><p>حدث خطأ أثناء تحميل المقارنة.</p></div>';});}\n" .
      "document.addEventListener('DOMContentLoaded',function(){injectFloating();injectBtns();refreshButtons();notify();renderComparePage();});\n" .
      "document.body.addEventListener('updated_wc_div',function(){injectBtns();refreshButtons();});\n" .
      "setInterval(function(){injectBtns();refreshButtons();},1600);\n" .
    "})();";
}
