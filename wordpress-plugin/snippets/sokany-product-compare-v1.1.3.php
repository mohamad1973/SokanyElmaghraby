/**
 * Snippet Name: SOKANY Product Compare v1.1.3
 * Description: أيقونة مقارنة ظاهرة دائمًا — ديسكتوب فوق السوشيال الجانبي، موبايل بجوار سوشيال الفوتر. مزامنة زر الثيم + صفحة مقارنة.
 *
 * Code Snippets:
 * - Do NOT paste a <?php opening tag
 * - Run snippet: Only run on site front-end  (أو Everywhere)
 * - عطّل أي سنابت مقارنة أقدم (v1.0 / v1.1 / v1.1.1 / v1.1.2)
 * - Activate
 * - Settings -> Permalinks -> Save مرة واحدة
 * - امسح الكاش ثم Ctrl+F5
 *
 * Source: wordpress-plugin/snippets/sokany-product-compare-v1.1.3.php
 * WordPress only — لا علاقة بـ Next.js / Vercel.
 */

if (!defined('ABSPATH')) {
    exit;
}

const SOKANY_CMP113_KEY = 'sokany-wp-compare-v1';
const SOKANY_CMP113_MAX = 4;
const SOKANY_CMP113_SLUG = 'compare-products';

function sokany_cmp113_woo(): bool {
    return class_exists('WooCommerce') && function_exists('wc_get_product');
}

function sokany_cmp113_is_page(): bool {
    if ((bool) get_query_var('sokany_compare')) {
        return true;
    }
    $path = wp_parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
    $path = is_string($path) ? trim($path, '/') : '';
    return $path === SOKANY_CMP113_SLUG;
}

add_action('init', function () {
    add_rewrite_rule('^' . SOKANY_CMP113_SLUG . '/?$', 'index.php?sokany_compare=1', 'top');
});

add_filter('query_vars', function (array $vars): array {
    $vars[] = 'sokany_compare';
    return $vars;
});

add_action('rest_api_init', function () {
    register_rest_route('sokany-compare/v1', '/products', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'sokany_cmp113_rest',
        'permission_callback' => '__return_true',
    ]);
});

function sokany_cmp113_rest(WP_REST_Request $request) {
    if (!sokany_cmp113_woo()) {
        return new WP_Error('sokany_woo_missing', 'WooCommerce غير مفعّل.', ['status' => 503]);
    }
    $ids_raw = (string) $request->get_param('ids');
    if ($ids_raw === '') {
        return rest_ensure_response(['products' => []]);
    }
    $ids = array_values(array_unique(array_filter(array_map('absint', explode(',', $ids_raw)))));
    $ids = array_slice($ids, 0, SOKANY_CMP113_MAX);
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
            'specs' => sokany_cmp113_specs($product),
        ];
    }
    usort($products, function (array $a, array $b) use ($ids): int {
        return array_search($a['id'], $ids, true) <=> array_search($b['id'], $ids, true);
    });
    return rest_ensure_response(['products' => $products]);
}

function sokany_cmp113_specs(WC_Product $product): array {
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
    return $specs;
}

add_action('template_redirect', function () {
    if (!sokany_cmp113_is_page()) {
        return;
    }
    status_header(200);
    nocache_headers();
    $shop = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : home_url('/shop');
    $rest = esc_url_raw(rest_url('sokany-compare/v1/products'));
    $home = home_url('/');
    ?><!doctype html>
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
         data-rest-url="<?php echo esc_attr($rest); ?>"
         data-shop-url="<?php echo esc_url($shop); ?>"></div>
    <p class="sokany-cmp-back"><a href="<?php echo esc_url($home); ?>">العودة للرئيسية</a></p>
  </div>
</main>
<?php wp_footer(); ?>
</body>
</html><?php
    exit;
}, 1);

/* CSS يُطبع مباشرة في head — أضمن من wp_enqueue الفارغ */
add_action('wp_head', function () {
    if (is_admin()) {
        return;
    }
    echo '<style id="sokany-cmp113-css">' . sokany_cmp113_css() . '</style>' . "\n";
}, 99);

/* JS يُطبع مباشرة قبل </body> */
add_action('wp_footer', function () {
    if (is_admin()) {
        return;
    }
    $url = esc_js(home_url('/' . SOKANY_CMP113_SLUG . '/'));
    $key = esc_js(SOKANY_CMP113_KEY);
    $max = (int) SOKANY_CMP113_MAX;
    echo '<script id="sokany-cmp113-js">' . sokany_cmp113_js($url, $key, $max) . '</script>' . "\n";
}, 99);

function sokany_cmp113_css(): string {
    return <<<'CSS'
.sokany-cmp-fab{
  position:fixed!important;
  z-index:2147483000!important;
  width:46px!important;height:46px!important;
  border-radius:999px!important;
  border:1px solid rgba(0,0,0,.12)!important;
  background:#fff!important;color:#111!important;
  display:flex!important;align-items:center!important;justify-content:center!important;
  text-decoration:none!important;
  box-shadow:0 6px 18px rgba(0,0,0,.16)!important;
  margin:0!important;padding:0!important;
  box-sizing:border-box!important;
}
.sokany-cmp-fab:hover{background:#daff00!important;color:#111!important;}
.sokany-cmp-fab svg{width:20px;height:20px;display:block;pointer-events:none;}
.sokany-cmp-fab .sokany-cmp-count{
  position:absolute;min-width:18px;height:18px;padding:0 5px;
  border-radius:999px;background:#000;color:#fff;
  font-size:11px;font-weight:700;line-height:18px;text-align:center;
  left:-5px;top:-5px;display:none;
}
/* Desktop: فوق منطقة السوشيال الجانبية */
@media (min-width:901px){
  .sokany-cmp-fab{
    top:42%!important;
    transform:translateY(-56px)!important;
  }
  html[dir="rtl"] .sokany-cmp-fab, body.rtl .sokany-cmp-fab, .sokany-cmp-fab.is-rtl{
    right:14px!important;left:auto!important;
  }
  html[dir="ltr"] .sokany-cmp-fab, .sokany-cmp-fab.is-ltr{
    left:14px!important;right:auto!important;
  }
  .sokany-cmp-fab.is-footer{display:none!important;}
}
/* Mobile: بجوار سوشيال الفوتر أو ثابت أسفل الشاشة */
@media (max-width:900px){
  .sokany-cmp-fab.is-side{display:none!important;}
  .sokany-cmp-fab.is-footer{
    position:relative!important;
    display:inline-flex!important;
    transform:none!important;
    top:auto!important;right:auto!important;left:auto!important;bottom:auto!important;
    margin:0 8px!important;
    vertical-align:middle!important;
    box-shadow:0 2px 8px rgba(0,0,0,.12)!important;
  }
  .sokany-cmp-fab.is-footer-fixed{
    position:fixed!important;
    display:flex!important;
    bottom:88px!important;
    transform:none!important;top:auto!important;
  }
  html[dir="rtl"] .sokany-cmp-fab.is-footer-fixed, body.rtl .sokany-cmp-fab.is-footer-fixed, .sokany-cmp-fab.is-footer-fixed.is-rtl{
    right:14px!important;left:auto!important;
  }
  html[dir="ltr"] .sokany-cmp-fab.is-footer-fixed, .sokany-cmp-fab.is-footer-fixed.is-ltr{
    left:14px!important;right:auto!important;
  }
}
.sokany-cmp-native-active{outline:2px solid #daff00!important;outline-offset:2px;}
.sokany-cmp-wrap{padding:32px 12px 50px;background:#f5f6f7;min-height:100vh;}
.sokany-cmp-inner{max-width:1200px;margin:0 auto;}
.sokany-cmp-kicker{color:#6d6d74;font-size:13px;font-weight:700;}
.sokany-cmp-title{margin:6px 0 8px;font-size:34px;line-height:1.2;}
.sokany-cmp-sub{margin:0 0 20px;color:#666;line-height:1.8;}
.cmp-empty,.cmp-loading{background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:22px;padding:26px;text-align:center;}
.cmp-empty a{display:inline-flex;margin-top:12px;background:#000;color:#fff;border-radius:999px;padding:10px 18px;text-decoration:none;}
.cmp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:22px;padding:18px;margin-bottom:16px;}
.cmp-card{text-align:center;}
.cmp-thumb{width:120px;height:120px;object-fit:contain;background:#fafafa;border-radius:16px;padding:8px;}
.cmp-name{font-weight:700;font-size:14px;line-height:1.6;min-height:44px;}
.cmp-price{font-weight:800;}
.cmp-remove{border:1px solid rgba(0,0,0,.1);border-radius:999px;background:#fff;padding:7px 12px;font-size:12px;cursor:pointer;}
.cmp-table-wrap{overflow:auto;background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:22px;padding:14px;}
.cmp-table{width:100%;border-collapse:collapse;table-layout:fixed;min-width:680px;}
.cmp-table th,.cmp-table td{padding:10px 8px;border-bottom:1px solid #efefef;font-size:13px;}
.cmp-attr{text-align:right;color:#666;font-weight:700;width:180px;}
.cmp-val{text-align:center;font-weight:700;}
.cmp-back{text-align:center;margin-top:16px;}
CSS;
}

function sokany_cmp113_js(string $compare_url, string $key, int $max): string {
    return <<<JS
(function(){
  var KEY='$key';
  var MAX=$max;
  var COMPARE_URL='$compare_url';
  var SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M7 5v14M7 19l-2-2M7 19l2-2M17 19V5M17 5l-2 2M17 5l2 2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sokany-cmp-count">0</span>';
  var FOOTER_SEL=['footer .wd-social-icons','footer .woodmart-social-icons','footer .social-icons','footer .footer-social','.footer-social-icons','.wd-footer-social','.site-footer .social-icons','.elementor-widget-social-icons','footer .social','#footer .social-icons','.footer-container .social-icons'];

  function read(){try{var a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a.filter(Boolean).map(Number):[];}catch(e){return[];}}
  function write(list){try{localStorage.setItem(KEY,JSON.stringify(list.slice(0,MAX)));}catch(e){} notify(); syncNative();}
  function toggle(id){id=Number(id);if(!id)return false;var list=read();var i=list.indexOf(id);if(i>=0)list.splice(i,1);else{if(list.length>=MAX){alert('يمكن مقارنة حتى '+MAX+' منتجات فقط.');return false;}list.push(id);}write(list);return true;}
  function notify(){var n=read().length;document.querySelectorAll('.sokany-cmp-count').forEach(function(el){el.textContent=String(n);el.style.display=n?'inline-block':'none';});}
  function isRtl(){var d=(document.documentElement.getAttribute('dir')||document.body.getAttribute('dir')||getComputedStyle(document.documentElement).direction||'rtl').toLowerCase();return d!=='ltr';}
  function isMobile(){return window.matchMedia('(max-width:900px)').matches;}
  function first(sels){for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);if(el)return el;}return null;}
  function findPid(el){var card=el.closest('[data-product_id],[data-product-id],li.product,.product,.product-item,.summary');if(!card)return 0;var pid=card.getAttribute('data-product_id')||card.getAttribute('data-product-id');if(!pid){var add=card.querySelector('[name="add-to-cart"],.add_to_cart_button[data-product_id],[data-product_id]');pid=add?(add.value||add.getAttribute('data-product_id')||add.getAttribute('data-product-id')):'';}return Number(pid||0);}

  function makeFab(extraClass){
    var a=document.createElement('a');
    a.href=COMPARE_URL;
    a.className='sokany-cmp-fab '+extraClass;
    a.setAttribute('aria-label','مقارنة المنتجات');
    a.setAttribute('title','مقارنة المنتجات');
    a.innerHTML=SVG;
    if(isRtl())a.classList.add('is-rtl'); else a.classList.add('is-ltr');
    return a;
  }

  function ensureIcon(){
    if(isMobile()){
      var side=document.querySelector('.sokany-cmp-fab.is-side');
      if(side)side.remove();
      var host=first(FOOTER_SEL);
      var fab=document.querySelector('.sokany-cmp-fab.is-footer, .sokany-cmp-fab.is-footer-fixed');
      if(!fab){
        fab=makeFab(host?'is-footer':'is-footer-fixed');
      }else{
        fab.classList.remove('is-side','is-footer','is-footer-fixed');
        fab.classList.add(host?'is-footer':'is-footer-fixed');
      }
      if(host){
        if(fab.parentNode!==host)host.insertBefore(fab,host.firstChild);
      }else if(!fab.parentNode||fab.parentNode!==document.body){
        document.body.appendChild(fab);
      }
    }else{
      var foot=document.querySelector('.sokany-cmp-fab.is-footer, .sokany-cmp-fab.is-footer-fixed');
      if(foot)foot.remove();
      var fab=document.querySelector('.sokany-cmp-fab.is-side');
      if(!fab){
        fab=makeFab('is-side');
        document.body.appendChild(fab);
      }else if(fab.parentNode!==document.body){
        document.body.appendChild(fab);
      }
      fab.classList.toggle('is-rtl',isRtl());
      fab.classList.toggle('is-ltr',!isRtl());
    }
    notify();
  }

  function syncNative(){
    var list=read();
    var sels='.compare,.compare-button,.yith-woocompare-button,.tinvwl_add_to_compare,.sokany-compare,.product-compare,.wd-compare-btn,.woodmart-compare-btn,a.compare';
    document.querySelectorAll(sels).forEach(function(btn){
      var id=findPid(btn); if(!id)return;
      var idx=list.indexOf(id);
      btn.classList.toggle('sokany-cmp-native-active',idx>=0);
    });
  }

  function bindNative(){
    document.addEventListener('click',function(e){
      var btn=e.target.closest('.compare,.compare-button,.yith-woocompare-button,.tinvwl_add_to_compare,.sokany-compare,.product-compare,.wd-compare-btn,.woodmart-compare-btn,a.compare');
      if(!btn)return;
      var id=findPid(btn); if(!id)return;
      if(toggle(id)){e.preventDefault();e.stopPropagation();}
    },true);
  }

  function renderPage(){
    var app=document.getElementById('sokany-cmp-app'); if(!app)return;
    var list=read();
    var shop=app.getAttribute('data-shop-url')||'/shop/';
    if(list.length<2){app.innerHTML='<div class="cmp-empty"><p>اختر منتجين على الأقل للمقارنة</p><a href="'+shop+'">تصفح المتجر</a></div>';return;}
    var rest=app.getAttribute('data-rest-url')||'';
    app.innerHTML='<div class="cmp-loading">جاري تحميل بيانات المقارنة...</div>';
    fetch(rest+'?ids='+list.join(','),{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(payload){
      var products=(payload&&payload.products)||[];
      if(!products.length){app.innerHTML='<div class="cmp-empty"><p>تعذر تحميل بيانات المنتجات.</p></div>';return;}
      var cards='<div class="cmp-grid">'+products.map(function(p,i){
        return '<div class="cmp-card"><div>'+(i+1)+'</div><a href="'+p.url+'"><img class="cmp-thumb" src="'+p.image+'" alt=""></a><p class="cmp-name">'+(p.name||'')+'</p><p class="cmp-price">'+(p.price||'')+'</p><button class="cmp-remove" data-rm="'+p.id+'">إزالة</button></div>';
      }).join('')+'</div>';
      var attrs=[],seen={};
      products.forEach(function(p){Object.keys(p.specs||{}).forEach(function(k){if(!seen[k]){seen[k]=1;attrs.push(k);}});});
      var head='<tr><th class="cmp-attr">الخاصية</th>'+products.map(function(_,i){return '<th>منتج '+(i+1)+'</th>';}).join('')+'</tr>';
      var rows=attrs.map(function(a){return '<tr><td class="cmp-attr">'+a+'</td>'+products.map(function(p){return '<td class="cmp-val">'+(p.specs&&p.specs[a]?p.specs[a]:'—')+'</td>';}).join('')+'</tr>';}).join('');
      if(!rows)rows='<tr><td class="cmp-attr">المواصفات</td><td class="cmp-val" colspan="'+products.length+'">لا توجد مواصفات.</td></tr>';
      app.innerHTML=cards+'<div class="cmp-table-wrap"><table class="cmp-table"><thead>'+head+'</thead><tbody>'+rows+'</tbody></table></div>';
      app.querySelectorAll('[data-rm]').forEach(function(btn){
        btn.addEventListener('click',function(){write(read().filter(function(x){return x!==Number(btn.getAttribute('data-rm'));}));renderPage();});
      });
    }).catch(function(){app.innerHTML='<div class="cmp-empty"><p>حدث خطأ أثناء تحميل المقارنة.</p></div>';});
  }

  function boot(){ensureIcon();bindNative();notify();syncNative();renderPage();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
  window.addEventListener('resize',ensureIcon);
  setInterval(function(){ensureIcon();syncNative();},2000);
})();
JS;
}
