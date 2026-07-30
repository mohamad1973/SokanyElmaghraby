/**
 * Snippet Name: CMaster Mobile Overflow Fix v1.0
 * Description: يمنع السكرول الأفقي (يمين/شمال) على الموبايل لموقع cmaster-eg.com.
 *
 * Code Snippets:
 * - Do NOT paste a <?php opening tag
 * - Run snippet: Only run on site front-end
 * - Activate
 * - امسح الكاش ثم اختبر على الموبايل
 *
 * Source: wordpress-plugin/snippets/cmaster-mobile-overflow-fix-v1.0.php
 * WordPress only — لا يلمس Next.js / Vercel.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('wp_head', function () {
    if (is_admin()) {
        return;
    }
    ?>
<style id="cmaster-mobile-overflow-fix-v1">
/* قفل عرض الصفحة على الموبايل */
@media (max-width: 900px) {
  html, body {
    max-width: 100% !important;
    overflow-x: hidden !important;
    position: relative !important;
  }

  body {
    width: 100% !important;
  }

  /* عناصر شائعة تسبب عرض زائد */
  img, video, iframe, embed, object, svg {
    max-width: 100% !important;
    height: auto !important;
  }

  table {
    max-width: 100% !important;
    display: block !important;
    overflow-x: auto !important;
  }

  .container,
  .container-fluid,
  .row,
  .site,
  .site-content,
  .site-header,
  .site-footer,
  .entry-content,
  .elementor,
  .elementor-section,
  .elementor-container,
  .elementor-widget-wrap,
  .elementor-row,
  .e-con,
  .e-con-inner,
  .woocommerce,
  .woocommerce-page,
  #page,
  #content,
  #wrapper,
  #main,
  .vc_row,
  .vc_column_container {
    max-width: 100% !important;
    overflow-x: clip !important;
  }

  /* منع عناصر مطلقة/ثابتة عريضة من توسيع الصفحة */
  .elementor-section.elementor-section-stretched,
  .elementor-top-section {
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    max-width: 100vw !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }

  /* نصوص طويلة بدون كسر تسبب سكرول */
  p, h1, h2, h3, h4, h5, h6, li, a, span {
    overflow-wrap: anywhere;
    word-wrap: break-word;
  }

  /* حقول النماذج */
  input, select, textarea {
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
}
</style>
    <?php
}, 99);

add_action('wp_footer', function () {
    if (is_admin()) {
        return;
    }
    ?>
<script id="cmaster-mobile-overflow-fix-v1-js">
(function () {
  function ensureViewport() {
    var meta = document.querySelector('meta[name="viewport"]');
    var content = 'width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover';
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    var current = (meta.getAttribute('content') || '').toLowerCase();
    if (current.indexOf('width=device-width') === -1 || current.indexOf('user-scalable=no') !== -1) {
      meta.setAttribute('content', content);
    }
  }

  function clampWideNodes() {
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    var docWidth = document.documentElement.clientWidth;
    var nodes = document.querySelectorAll('body *');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || el === document.body || el === document.documentElement) continue;
      var rect = el.getBoundingClientRect();
      if (rect.width > docWidth + 2) {
        el.style.maxWidth = '100%';
        el.style.boxSizing = 'border-box';
        if (getComputedStyle(el).position === 'absolute' || getComputedStyle(el).position === 'fixed') {
          if (rect.left < 0) el.style.left = '0px';
          if (rect.right > docWidth) el.style.right = '0px';
        }
      }
    }
  }

  function run() {
    ensureViewport();
    clampWideNodes();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  window.addEventListener('load', clampWideNodes);
  window.addEventListener('resize', clampWideNodes);
  setTimeout(clampWideNodes, 800);
})();
</script>
    <?php
}, 99);
