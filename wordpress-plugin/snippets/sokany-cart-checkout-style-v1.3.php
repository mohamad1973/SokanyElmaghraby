/**
 * Snippet Name: SOKANY Cart Checkout Style v1.3
 * Description: v1.3 — ملء جدول أوردرك + ترجمة الدفع عند الاستلام والشروط + إخفاء دعوة المراجعة + كل ميزات v1.2.
 *
 * Code Snippets:
 * - Do NOT paste a <?php opening tag
 * - Run snippet: Only run on site front-end
 * - Deactivate/delete v1.0, v1.1, and v1.2 first
 * - Activate this snippet
 *
 * Source: wordpress-plugin/snippets/sokany-cart-checkout-style-v1.3.php
 * Does NOT touch Next.js / Vercel storefront.
 */

if (!defined('ABSPATH')) {
    exit;
}

function sokany_cc13_is_target_page(): bool {
    if (!function_exists('is_cart') || !function_exists('is_checkout')) {
        return false;
    }

    return is_cart() || is_checkout();
}

add_filter('default_checkout_billing_country', function ($country) {
    return 'EG';
});

add_filter('default_checkout_shipping_country', function ($country) {
    return 'EG';
});

add_filter('woocommerce_checkout_fields', function ($fields) {
    if (isset($fields['billing']['billing_country'])) {
        unset($fields['billing']['billing_country']);
    }
    if (isset($fields['shipping']['shipping_country'])) {
        unset($fields['shipping']['shipping_country']);
    }
    return $fields;
}, 20);

add_filter('woocommerce_default_address_fields', function ($fields) {
    if (isset($fields['country'])) {
        $fields['country']['required'] = false;
    }
    return $fields;
}, 20);

add_action('woocommerce_checkout_process', function () {
    if (empty($_POST['billing_country'])) {
        $_POST['billing_country'] = 'EG';
    }
}, 5);


/**
 * Front-end text: COD + terms Arabic; hide review-invite sentence.
 */
add_filter('gettext', 'sokany_cc13_translate_strings', 20, 3);
add_filter('ngettext', 'sokany_cc13_translate_nstrings', 20, 5);
add_filter('gettext_with_context', 'sokany_cc13_translate_strings_ctx', 20, 4);

function sokany_cc13_should_translate(): bool {
    if (is_admin() && !(defined('DOING_AJAX') && DOING_AJAX)) {
        return false;
    }
    if (function_exists('is_checkout') && is_checkout()) {
        return true;
    }
    // Checkout fragments / updated_checkout AJAX
    if (defined('DOING_AJAX') && DOING_AJAX) {
        $action = isset($_REQUEST['wc-ajax']) ? (string) $_REQUEST['wc-ajax'] : '';
        if ($action === 'update_order_review' || $action === 'checkout') {
            return true;
        }
    }
    return false;
}

function sokany_cc13_translate_strings($translated, $text, $domain) {
    if (!sokany_cc13_should_translate()) {
        return $translated;
    }

    $map = [
        'Cash on delivery' => 'الدفع عند الاستلام',
        'Cash on Delivery' => 'الدفع عند الاستلام',
        'Pay with cash upon delivery.' => 'ادفع نقداً عند استلام الطلب.',
        'I have read and agree to the website terms and conditions' => 'أوافق على الشروط والأحكام',
        'I have read and agree to the website %s' => 'أوافق على %s',
        'terms and conditions' => 'الشروط والأحكام',
        'Terms and Conditions' => 'الشروط والأحكام',
        'Would you like to be invited to review your order?' => '',
        'هل ترغب فى ان تتم دعوتك لمراجعه طلبك' => '',
        'هل ترغب في أن تتم دعوتك لمراجعة طلبك' => '',
        'هل ترغب فى أن تتم دعوتك لمراجعة طلبك؟' => '',
    ];

    if (isset($map[$text])) {
        return $map[$text];
    }
    if (isset($map[$translated])) {
        return $map[$translated];
    }

    // Soft match review-invite sentence in Arabic or English.
    if (is_string($translated) && (
        strpos($translated, 'دعوتك لمراجعه') !== false ||
        strpos($translated, 'دعوتك لمراجعة') !== false ||
        stripos($translated, 'invited to review') !== false
    )) {
        return '';
    }

    // Soft match English terms checkbox variants.
    if (is_string($text) && stripos($text, 'agree to the website') !== false && stripos($text, 'terms') !== false) {
        return strpos($text, '%s') !== false ? 'أوافق على %s' : 'أوافق على الشروط والأحكام';
    }

    return $translated;
}

function sokany_cc13_translate_nstrings($translated, $single, $plural, $number, $domain) {
    return sokany_cc13_translate_strings($translated, $number === 1 ? $single : $plural, $domain);
}

function sokany_cc13_translate_strings_ctx($translated, $text, $context, $domain) {
    return sokany_cc13_translate_strings($translated, $text, $domain);
}

add_action('wp_footer', function () {
    if (!function_exists('is_checkout') || !is_checkout()) {
        return;
    }
    ?>
    <script>
    (function () {
      function hideReviewInvite() {
        var needles = [
          "دعوتك لمراجعه",
          "دعوتك لمراجعة",
          "invited to review",
          "review your order"
        ];
        document.querySelectorAll("body.woocommerce-checkout p, body.woocommerce-checkout label, body.woocommerce-checkout span, body.woocommerce-checkout div").forEach(function (el) {
          if (el.children && el.children.length > 3) return;
          var text = (el.textContent || "").trim();
          if (!text || text.length > 180) return;
          var hit = needles.some(function (n) { return text.toLowerCase().indexOf(n.toLowerCase()) !== -1; });
          if (hit) {
            el.style.display = "none";
            el.setAttribute("hidden", "hidden");
          }
        });
      }
      hideReviewInvite();
      document.body.addEventListener("updated_checkout", hideReviewInvite);
      setTimeout(hideReviewInvite, 600);
    })();
    </script>
    <?php
}, 99);

add_action('wp_enqueue_scripts', function () {
    if (!sokany_cc13_is_target_page()) {
        return;
    }

    wp_register_style('sokany-cc13-style', false, [], '1.3.0');
    wp_enqueue_style('sokany-cc13-style');
    wp_add_inline_style('sokany-cc13-style', sokany_cc13_css());

    wp_register_script('sokany-cc13-script', false, [], '1.3.0', true);
    wp_enqueue_script('sokany-cc13-script');
    wp_add_inline_script('sokany-cc13-script', sokany_cc13_js(), 'after');
}, 99);

function sokany_cc13_css(): string {
    return <<<'CSS'
:root {
  --sokany-lime: #daff00;
  --sokany-lime-dark: #c1e200;
  --sokany-lime-soft: #eef9a0;
  --sokany-green-msg: #5f7d00;
  --sokany-green-msg-text: #ffffff;
  --sokany-ink: #0a0a0a;
  --sokany-muted: #52525b;
  --sokany-border: rgba(0, 0, 0, 0.1);
  --sokany-card: #ffffff;
  --sokany-soft: #f4f4f5;
  --sokany-radius: 18px;
  --sokany-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
}

/* ========== Shared notices ========== */
.woocommerce-message,
.woocommerce-info,
.wc-block-components-notice-banner.is-success,
.wc-block-components-notice-banner.is-info {
  background: var(--sokany-green-msg) !important;
  color: var(--sokany-green-msg-text) !important;
  border: 0 !important;
  border-radius: 12px !important;
  box-shadow: none !important;
  padding: 14px 16px !important;
  font-weight: 700 !important;
}

.woocommerce-message a,
.woocommerce-info a,
.woocommerce-message .button,
.woocommerce-info .button,
.wc-block-components-notice-banner.is-success a,
.wc-block-components-notice-banner.is-info a {
  color: #fff !important;
  background: rgba(0, 0, 0, 0.2) !important;
  border: 0 !important;
  border-radius: 999px !important;
  padding: 6px 12px !important;
  font-weight: 700 !important;
}

.woocommerce-message::before,
.woocommerce-info::before {
  color: #fff !important;
}

.woocommerce-error,
.wc-block-components-notice-banner.is-error {
  border-radius: 12px !important;
}

/* ========== Hide country ========== */
body.woocommerce-checkout #billing_country_field,
body.woocommerce-checkout #shipping_country_field,
body.woocommerce-checkout .woocommerce-billing-fields #billing_country_field,
body.woocommerce-checkout .woocommerce-shipping-fields #shipping_country_field,
body.woocommerce-checkout .form-row.address-field#billing_country_field,
body.woocommerce-checkout .wc-block-components-address-form__country,
body.woocommerce-checkout .wc-block-components-country-input {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}

/* ========== Select / Select2: black text on green ========== */
body.woocommerce-checkout .form-row select,
body.woocommerce-checkout select,
body.woocommerce-checkout .select2-container .select2-selection--single,
body.woocommerce-checkout .select2-container--default .select2-selection--single .select2-selection__rendered,
body.woocommerce-checkout .select2-container--default .select2-selection--single .select2-selection__placeholder,
body.woocommerce-checkout .select2-container--default .select2-search--dropdown .select2-search__field,
body.woocommerce-checkout .wc-block-components-combobox input,
body.woocommerce-checkout .wc-block-components-combobox-control input,
.select2-container--default .select2-selection--single .select2-selection__rendered,
.select2-container--default .select2-search--dropdown .select2-search__field {
  color: var(--sokany-ink) !important;
  -webkit-text-fill-color: var(--sokany-ink) !important;
  caret-color: var(--sokany-ink) !important;
}

body.woocommerce-checkout .select2-container--default .select2-selection--single {
  background: var(--sokany-soft) !important;
  border: 1px solid var(--sokany-border) !important;
  border-radius: 12px !important;
  min-height: 48px !important;
  display: flex !important;
  align-items: center !important;
}

body.woocommerce-checkout .select2-container--default .select2-selection--single .select2-selection__arrow {
  height: 46px !important;
}

body.woocommerce-checkout .select2-container--default.select2-container--open .select2-selection--single,
body.woocommerce-checkout .select2-container--default.select2-container--focus .select2-selection--single,
body.woocommerce-checkout .form-row select:focus {
  background: var(--sokany-lime-soft) !important;
  border-color: var(--sokany-lime-dark) !important;
  color: var(--sokany-ink) !important;
  -webkit-text-fill-color: var(--sokany-ink) !important;
}

body.woocommerce-checkout .select2-dropdown,
.select2-container--open .select2-dropdown {
  background: #fff !important;
  border: 1px solid var(--sokany-border) !important;
  border-radius: 12px !important;
  overflow: hidden;
  z-index: 999999 !important;
}

body.woocommerce-checkout .select2-container--default .select2-results__option,
.select2-container--default .select2-results__option {
  color: var(--sokany-ink) !important;
  -webkit-text-fill-color: var(--sokany-ink) !important;
  background: #fff !important;
}

body.woocommerce-checkout .select2-container--default .select2-results__option--highlighted[aria-selected],
body.woocommerce-checkout .select2-container--default .select2-results__option--highlighted,
body.woocommerce-checkout .select2-container--default .select2-results__option[aria-selected="true"],
.select2-container--default .select2-results__option--highlighted[aria-selected],
.select2-container--default .select2-results__option--highlighted,
.select2-container--default .select2-results__option[aria-selected="true"] {
  background: var(--sokany-lime) !important;
  color: var(--sokany-ink) !important;
  -webkit-text-fill-color: var(--sokany-ink) !important;
}

body.woocommerce-checkout .form-row select option,
body.woocommerce-checkout select option {
  color: var(--sokany-ink) !important;
  background: #fff !important;
}

/* ========== Desktop shells: 80vw ========== */
@media (min-width: 992px) {
  body.woocommerce-cart #primary,
  body.woocommerce-cart .content-area,
  body.woocommerce-cart .site-content,
  body.woocommerce-cart #content,
  body.woocommerce-cart .entry-content,
  body.woocommerce-cart .container,
  body.woocommerce-cart .ast-container,
  body.woocommerce-cart .e-con-inner,
  body.woocommerce-cart .elementor-section.elementor-section-boxed > .elementor-container,
  body.woocommerce-cart .woocommerce,
  body.woocommerce-cart .wp-block-woocommerce-cart,
  body.woocommerce-checkout #primary,
  body.woocommerce-checkout .content-area,
  body.woocommerce-checkout .site-content,
  body.woocommerce-checkout #content,
  body.woocommerce-checkout .entry-content,
  body.woocommerce-checkout .container,
  body.woocommerce-checkout .ast-container,
  body.woocommerce-checkout .e-con-inner,
  body.woocommerce-checkout .elementor-section.elementor-section-boxed > .elementor-container,
  body.woocommerce-checkout .woocommerce,
  body.woocommerce-checkout .wp-block-woocommerce-checkout {
    width: 80vw !important;
    max-width: 80vw !important;
    margin-left: auto !important;
    margin-right: auto !important;
    float: none !important;
    box-sizing: border-box !important;
  }

  body.woocommerce-cart .site-content::before,
  body.woocommerce-cart .site-content::after,
  body.woocommerce-cart .woocommerce::before,
  body.woocommerce-cart .woocommerce::after,
  body.woocommerce-checkout .woocommerce::before,
  body.woocommerce-checkout .woocommerce::after {
    display: none !important;
    content: none !important;
  }
}

@media (max-width: 991px) {
  body.woocommerce-cart .woocommerce,
  body.woocommerce-checkout .woocommerce {
    width: 100% !important;
    max-width: 100% !important;
    padding-inline: 12px;
    box-sizing: border-box;
  }
}

/* ========== Cart cards ========== */
body.woocommerce-cart .woocommerce-cart-form,
body.woocommerce-cart .cart-collaterals .cart_totals,
body.woocommerce-cart .wp-block-woocommerce-cart-items-block,
body.woocommerce-cart .wp-block-woocommerce-cart-order-summary-block,
body.woocommerce-cart .wc-block-cart {
  background: var(--sokany-card);
  border: 1px solid var(--sokany-border);
  border-radius: var(--sokany-radius);
  box-shadow: var(--sokany-shadow);
  box-sizing: border-box;
}

body.woocommerce-cart .woocommerce-cart-form {
  padding: 18px 18px 8px;
  margin-bottom: 18px;
}

body.woocommerce-cart .cart-collaterals {
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

body.woocommerce-cart .cart-collaterals .cart_totals {
  padding: 18px;
  width: 100% !important;
  float: none !important;
  max-width: none !important;
}

body.woocommerce-cart table.shop_table {
  border: 0 !important;
  margin: 0 !important;
  width: 100% !important;
}

body.woocommerce-cart table.shop_table th,
body.woocommerce-cart table.shop_table td {
  border: 0 !important;
  border-bottom: 1px solid var(--sokany-border) !important;
  padding: 16px 10px !important;
  vertical-align: middle !important;
}

body.woocommerce-cart table.shop_table thead th {
  color: var(--sokany-muted);
  font-size: 13px;
  font-weight: 700;
}

body.woocommerce-cart table.shop_table .product-name a {
  color: var(--sokany-ink) !important;
  font-weight: 700;
  text-decoration: none !important;
}

body.woocommerce-cart table.shop_table .product-price,
body.woocommerce-cart table.shop_table .product-subtotal,
body.woocommerce-cart .cart_totals .amount,
body.woocommerce-cart .wc-block-components-product-price,
body.woocommerce-cart .wc-block-components-totals-item__value {
  color: var(--sokany-green-msg) !important;
  font-weight: 800 !important;
}

body.woocommerce-cart .product-remove a,
body.woocommerce-cart .wc-block-cart-item__remove-link {
  color: #b42318 !important;
  font-weight: 700 !important;
}

body.woocommerce-cart .quantity .qty,
body.woocommerce-cart .wc-block-components-quantity-selector input {
  border-radius: 10px !important;
  border: 1px solid var(--sokany-border) !important;
  min-height: 42px;
  text-align: center;
}

body.woocommerce-cart .cart_totals h2 {
  font-size: 1.15rem !important;
  font-weight: 800 !important;
  margin-bottom: 12px !important;
}

body.woocommerce-cart .wc-proceed-to-checkout a.checkout-button,
body.woocommerce-cart .wc-block-cart__submit-button,
body.woocommerce-cart button[name="update_cart"],
body.woocommerce-cart .button[name="update_cart"] {
  background: var(--sokany-lime) !important;
  color: var(--sokany-ink) !important;
  border: 0 !important;
  border-radius: 999px !important;
  font-weight: 800 !important;
  padding: 14px 22px !important;
  box-shadow: none !important;
}

body.woocommerce-cart .wc-proceed-to-checkout a.checkout-button:hover,
body.woocommerce-cart .wc-block-cart__submit-button:hover {
  background: var(--sokany-lime-dark) !important;
}

body.woocommerce-cart .coupon .input-text {
  border-radius: 12px !important;
  border: 1px solid var(--sokany-border) !important;
  min-height: 44px;
}

/* Cart: forced side-by-side on desktop */
@media (min-width: 992px) {
  body.woocommerce-cart .woocommerce {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: wrap !important;
    align-items: flex-start !important;
    justify-content: space-between !important;
    gap: 24px !important;
  }

  body.woocommerce-cart .woocommerce-notices-wrapper,
  body.woocommerce-cart .woocommerce-form-coupon-toggle {
    flex: 0 0 100% !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  body.woocommerce-cart form.woocommerce-cart-form {
    flex: 1 1 0 !important;
    float: none !important;
    clear: none !important;
    width: auto !important;
    max-width: none !important;
    margin: 0 !important;
    display: block !important;
  }

  body.woocommerce-cart .cart-collaterals {
    flex: 0 0 clamp(300px, 32%, 420px) !important;
    float: none !important;
    clear: none !important;
    width: clamp(300px, 32%, 420px) !important;
    max-width: 420px !important;
    margin: 0 !important;
    position: sticky !important;
    top: 24px !important;
    align-self: flex-start !important;
  }

  body.woocommerce-cart .cart-collaterals .cart_totals {
    float: none !important;
    width: 100% !important;
    max-width: none !important;
  }

  body.woocommerce-cart .woocommerce-cart-form::after,
  body.woocommerce-cart .woocommerce-cart-form::before,
  body.woocommerce-cart .cart-collaterals::after,
  body.woocommerce-cart .cart-collaterals::before {
    display: none !important;
    content: none !important;
    clear: none !important;
  }
}

/* ========== Checkout cards ========== */
body.woocommerce-checkout #customer_details,
body.woocommerce-checkout #order_review,
body.woocommerce-checkout .wp-block-woocommerce-checkout-fields-block,
body.woocommerce-checkout .wp-block-woocommerce-checkout-order-summary-block,
body.woocommerce-checkout .wc-block-checkout__sidebar,
body.woocommerce-checkout .wc-block-checkout__main {
  background: var(--sokany-card);
  border: 1px solid var(--sokany-border);
  border-radius: var(--sokany-radius);
  box-shadow: var(--sokany-shadow);
  box-sizing: border-box;
}

body.woocommerce-checkout #customer_details,
body.woocommerce-checkout .wp-block-woocommerce-checkout-fields-block,
body.woocommerce-checkout .wc-block-checkout__main {
  padding: 22px;
}

body.woocommerce-checkout #order_review,
body.woocommerce-checkout .wp-block-woocommerce-checkout-order-summary-block,
body.woocommerce-checkout .wc-block-checkout__sidebar {
  padding: 20px;
}

body.woocommerce-checkout .woocommerce-billing-fields > h3,
body.woocommerce-checkout .woocommerce-additional-fields > h3,
body.woocommerce-checkout #order_review_heading,
body.woocommerce-checkout .wc-block-components-checkout-step__title {
  color: var(--sokany-ink) !important;
  font-weight: 800 !important;
  font-size: 1.2rem !important;
  margin-bottom: 14px !important;
}

body.woocommerce-checkout .form-row input.input-text,
body.woocommerce-checkout .form-row textarea,
body.woocommerce-checkout .form-row select,
body.woocommerce-checkout .select2-container .select2-selection--single,
body.woocommerce-checkout .wc-block-components-text-input input,
body.woocommerce-checkout .wc-block-components-textarea textarea,
body.woocommerce-checkout .wc-block-components-combobox input {
  background: var(--sokany-soft) !important;
  border: 1px solid var(--sokany-border) !important;
  border-radius: 12px !important;
  min-height: 48px !important;
  color: var(--sokany-ink) !important;
  -webkit-text-fill-color: var(--sokany-ink) !important;
  box-shadow: none !important;
}

body.woocommerce-checkout .form-row textarea,
body.woocommerce-checkout .wc-block-components-textarea textarea {
  min-height: 100px !important;
}

body.woocommerce-checkout .form-row label,
body.woocommerce-checkout .wc-block-components-text-input label {
  font-weight: 700 !important;
  color: var(--sokany-ink) !important;
}


/* ========== v1.3: order review table fills the left card ========== */
body.woocommerce-checkout #order_review,
body.woocommerce-checkout #order_review .woocommerce-checkout-review-order,
body.woocommerce-checkout #order_review .woocommerce-checkout-review-order-table,
body.woocommerce-checkout #order_review > *,
body.woocommerce-checkout .woocommerce-checkout-review-order-table {
  width: 100% !important;
  max-width: 100% !important;
  float: none !important;
  box-sizing: border-box !important;
}

body.woocommerce-checkout #order_review table.shop_table,
body.woocommerce-checkout #order_review table.woocommerce-checkout-review-order-table {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 100% !important;
  table-layout: fixed !important;
  float: none !important;
  margin: 0 !important;
  display: table !important;
}

body.woocommerce-checkout #order_review table.shop_table col,
body.woocommerce-checkout #order_review table.shop_table colgroup {
  width: auto !important;
}

body.woocommerce-checkout #order_review table.shop_table th,
body.woocommerce-checkout #order_review table.shop_table td {
  width: auto !important;
  max-width: none !important;
}

body.woocommerce-checkout #order_review table.shop_table .product-name {
  width: 70% !important;
}

body.woocommerce-checkout #order_review table.shop_table .product-total,
body.woocommerce-checkout #order_review table.shop_table tfoot th,
body.woocommerce-checkout #order_review table.shop_table tfoot td {
  width: 30% !important;
}

/* Hide review invitation / reminder copy */
body.woocommerce-checkout .ivole-checkout-message,
body.woocommerce-checkout .cr-checkout-review-invite,
body.woocommerce-checkout .cr-review-invite,
body.woocommerce-checkout [class*="review-invite"],
body.woocommerce-checkout [class*="invite-review"],
body.woocommerce-checkout .sokany-hide-review-invite {
  display: none !important;
}

body.woocommerce-checkout #order_review table.shop_table,
body.woocommerce-checkout .wc-block-components-order-summary {
  border: 0 !important;
  width: 100% !important;
}

body.woocommerce-checkout #order_review table.shop_table th,
body.woocommerce-checkout #order_review table.shop_table td {
  border-color: var(--sokany-border) !important;
  padding: 12px 8px !important;
}

body.woocommerce-checkout #order_review .amount,
body.woocommerce-checkout .wc-block-components-product-price,
body.woocommerce-checkout .wc-block-components-totals-footer-item .wc-block-components-totals-item__value {
  color: var(--sokany-green-msg) !important;
  font-weight: 800 !important;
}

body.woocommerce-checkout #payment {
  background: transparent !important;
  border: 0 !important;
  padding: 0 !important;
}

body.woocommerce-checkout #payment ul.payment_methods {
  border: 0 !important;
  padding: 0 !important;
}

body.woocommerce-checkout #payment ul.payment_methods li {
  background: #fff;
  border: 1px solid var(--sokany-border);
  border-radius: 14px;
  margin-bottom: 10px;
  padding: 12px 14px;
}

body.woocommerce-checkout #place_order,
body.woocommerce-checkout .wc-block-components-checkout-place-order-button {
  background: var(--sokany-lime) !important;
  color: var(--sokany-ink) !important;
  border: 0 !important;
  border-radius: 999px !important;
  font-weight: 800 !important;
  min-height: 52px !important;
  width: 100% !important;
  box-shadow: none !important;
}

body.woocommerce-checkout #place_order:hover,
body.woocommerce-checkout .wc-block-components-checkout-place-order-button:hover {
  background: var(--sokany-lime-dark) !important;
}

/* Checkout: forced side-by-side on desktop */
@media (min-width: 992px) {
  body.woocommerce-checkout form.checkout.woocommerce-checkout,
  body.woocommerce-checkout form.checkout {
    display: contents !important;
  }

  body.woocommerce-checkout .woocommerce {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: wrap !important;
    align-items: flex-start !important;
    justify-content: space-between !important;
    gap: 24px !important;
  }

  body.woocommerce-checkout .woocommerce-notices-wrapper,
  body.woocommerce-checkout .woocommerce-form-login-toggle,
  body.woocommerce-checkout .woocommerce-form-coupon-toggle,
  body.woocommerce-checkout .checkout-inline-error-message {
    flex: 0 0 100% !important;
    width: 100% !important;
  }

  body.woocommerce-checkout #customer_details {
    flex: 1 1 0 !important;
    width: auto !important;
    max-width: none !important;
    float: none !important;
    clear: none !important;
    margin: 0 !important;
  }

  body.woocommerce-checkout #order_review_heading {
    display: none !important;
  }

  body.woocommerce-checkout #order_review {
    flex: 0 0 clamp(320px, 34%, 460px) !important;
    width: clamp(320px, 34%, 460px) !important;
    max-width: 460px !important;
    float: none !important;
    clear: none !important;
    margin: 0 !important;
    position: sticky !important;
    top: 24px !important;
    align-self: flex-start !important;
  }

  body.woocommerce-checkout .col2-set,
  body.woocommerce-checkout .col-1,
  body.woocommerce-checkout .col-2 {
    width: 100% !important;
    float: none !important;
    max-width: none !important;
  }

  body.woocommerce-checkout #customer_details::after,
  body.woocommerce-checkout #customer_details::before,
  body.woocommerce-checkout #order_review::after,
  body.woocommerce-checkout #order_review::before {
    display: none !important;
    content: none !important;
  }
}

body.woocommerce-order-received .woocommerce-order {
  max-width: min(860px, 96vw);
  margin-inline: auto;
  background: #fff;
  border: 1px solid var(--sokany-border);
  border-radius: var(--sokany-radius);
  box-shadow: var(--sokany-shadow);
  padding: 22px;
}
CSS;
}

function sokany_cc13_js(): string {
    return <<<'JS'
(function () {
  if (!document.body || !document.body.classList.contains("woocommerce-checkout")) {
    return;
  }

  var STORAGE_KEY = "sokany-wp-checkout-address-v1";
  var FIELD_SELECTORS = [
    "#billing_first_name",
    "#billing_last_name",
    "#billing_phone",
    "#billing_email",
    "#billing_address_1",
    "#billing_address_2",
    "#billing_city",
    "#billing_state",
    "#billing_postcode",
    "#order_comments",
    "#shipping_address_1",
    "#shipping_city",
    "#shipping_state",
    '[name="billing_first_name"]',
    '[name="billing_last_name"]',
    '[name="billing_phone"]',
    '[name="billing_email"]',
    '[name="billing_address_1"]',
    '[name="billing_city"]',
    '[name="billing_state"]',
    '[name="order_comments"]',
    'input[autocomplete="tel"]',
    'input[autocomplete="name"]',
    'textarea[autocomplete="street-address"]'
  ];

  function uniq(list) {
    return list.filter(function (el, idx, arr) {
      return el && arr.indexOf(el) === idx;
    });
  }

  function collectFields() {
    var nodes = [];
    FIELD_SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        nodes.push(el);
      });
    });
    return uniq(nodes);
  }

  function fieldKey(el) {
    return el.id || el.getAttribute("name") || el.getAttribute("autocomplete") || "";
  }

  function readStore() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeStore(data) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data || {}));
    } catch (e) {}
  }

  function saveAll() {
    var data = readStore();
    collectFields().forEach(function (el) {
      var key = fieldKey(el);
      if (!key) return;
      if (el.tagName === "SELECT") {
        data[key] = el.value;
      } else if (el.type === "checkbox" || el.type === "radio") {
        data[key] = !!el.checked;
      } else {
        data[key] = el.value;
      }
    });
    writeStore(data);
  }

  function applyValue(el, value) {
    if (value === undefined || value === null || value === "") return;
    if (el.tagName === "SELECT") {
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (el.type === "checkbox" || el.type === "radio") {
      el.checked = !!value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (!el.value) {
      el.value = String(value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function restoreAll() {
    var data = readStore();
    collectFields().forEach(function (el) {
      var key = fieldKey(el);
      if (!key || !(key in data)) return;
      applyValue(el, data[key]);
    });
  }

  function bind() {
    collectFields().forEach(function (el) {
      el.addEventListener("input", saveAll);
      el.addEventListener("change", saveAll);
    });
  }

  function boot() {
    restoreAll();
    bind();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.body.addEventListener("updated_checkout", function () {
    restoreAll();
    bind();
  });

  setTimeout(function () {
    restoreAll();
    bind();
  }, 800);
})();
JS;
}
