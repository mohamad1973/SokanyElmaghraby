/**
 * Snippet Name: SOKANY Cart Checkout Style v1.1
 * Description: v1.1 — عرض أوسع، إجمالي السلة جنب المنتجات، تشيك أوت أعرض، إخفاء البلد، نص أسود في القوائم المنسدلة + حفظ بيانات العميل.
 *
 * Code Snippets:
 * - Do NOT paste a <?php opening tag
 * - Run snippet: Only run on site front-end
 * - Deactivate/delete older "SOKANY Cart + Checkout Style" (v1.0) first
 * - Activate this snippet
 *
 * Source: wordpress-plugin/snippets/sokany-cart-checkout-style-v1.1.php
 * Does NOT touch Next.js / Vercel storefront.
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Only cart / checkout (includes order-received via is_checkout).
 */
function sokany_cc11_is_target_page(): bool {
    if (!function_exists('is_cart') || !function_exists('is_checkout')) {
        return false;
    }

    return is_cart() || is_checkout();
}

/**
 * Default country Egypt; hide country from checkout UI.
 */
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

add_action('wp_enqueue_scripts', function () {
    if (!sokany_cc11_is_target_page()) {
        return;
    }

    wp_register_style('sokany-cc11-style', false, [], '1.1.0');
    wp_enqueue_style('sokany-cc11-style');
    wp_add_inline_style('sokany-cc11-style', sokany_cc11_css());

    wp_register_script('sokany-cc11-script', false, [], '1.1.0', true);
    wp_enqueue_script('sokany-cc11-script');
    wp_add_inline_script('sokany-cc11-script', sokany_cc11_js(), 'after');
}, 40);

/**
 * CSS — wider layout + select contrast + hide country.
 */
function sokany_cc11_css(): string {
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

/* ========== Hide country (EG default via PHP) ========== */
body.woocommerce-checkout #billing_country_field,
body.woocommerce-checkout #shipping_country_field,
body.woocommerce-checkout .woocommerce-billing-fields #billing_country_field,
body.woocommerce-checkout .wc-block-components-address-form__country {
  display: none !important;
}

/* ========== Select / Select2: black text on green ========== */
body.woocommerce-checkout .form-row select,
body.woocommerce-checkout select,
body.woocommerce-checkout .select2-container .select2-selection--single,
body.woocommerce-checkout .select2-container--default .select2-selection--single .select2-selection__rendered,
body.woocommerce-checkout .select2-container--default .select2-selection--single .select2-selection__placeholder,
body.woocommerce-checkout .wc-block-components-combobox input,
body.woocommerce-checkout .wc-block-components-combobox-control input {
  color: var(--sokany-ink) !important;
  -webkit-text-fill-color: var(--sokany-ink) !important;
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
}

body.woocommerce-checkout .select2-dropdown,
body.woocommerce-checkout .select2-container--open .select2-dropdown {
  background: #fff !important;
  border: 1px solid var(--sokany-border) !important;
  border-radius: 12px !important;
  overflow: hidden;
}

body.woocommerce-checkout .select2-container--default .select2-results__option,
body.woocommerce-checkout .select2-results__option,
.select2-container--default .select2-results__option {
  color: var(--sokany-ink) !important;
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
}

body.woocommerce-checkout .form-row select option,
body.woocommerce-checkout select option {
  color: var(--sokany-ink) !important;
  background: #fff !important;
}

/* ========== Cart page ========== */
body.woocommerce-cart .site-content,
body.woocommerce-cart #content,
body.woocommerce-cart .entry-content,
body.woocommerce-cart .woocommerce,
body.woocommerce-cart .wp-block-woocommerce-cart {
  max-width: min(1240px, 96vw) !important;
  width: 100% !important;
  margin-inline: auto !important;
}

body.woocommerce-cart .woocommerce-cart-form,
body.woocommerce-cart .cart-collaterals,
body.woocommerce-cart .cart_totals,
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
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}

body.woocommerce-cart .cart-collaterals .cart_totals {
  padding: 18px;
  width: 100% !important;
  float: none !important;
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

body.woocommerce-cart .cart_totals h2,
body.woocommerce-cart .wp-block-woocommerce-cart-order-summary-heading-block {
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

@media (min-width: 992px) {
  body.woocommerce-cart .woocommerce {
    display: grid !important;
    grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.85fr) !important;
    gap: 22px !important;
    align-items: start !important;
  }

  body.woocommerce-cart .woocommerce-notices-wrapper,
  body.woocommerce-cart .woocommerce-form-coupon-toggle {
    grid-column: 1 / -1;
  }

  body.woocommerce-cart .woocommerce-cart-form {
    margin-bottom: 0 !important;
    width: 100% !important;
    max-width: none !important;
  }

  body.woocommerce-cart .cart-collaterals {
    position: sticky;
    top: 24px;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
  }

  body.woocommerce-cart .cart-collaterals .cart_totals {
    float: none !important;
    width: 100% !important;
    max-width: none !important;
  }

  /* Theme may wrap cart form + collaterals; force side-by-side */
  body.woocommerce-cart .woocommerce::after {
    display: none !important;
  }
}

/* ========== Checkout page ========== */
body.woocommerce-checkout .site-content,
body.woocommerce-checkout #content,
body.woocommerce-checkout .entry-content,
body.woocommerce-checkout .woocommerce,
body.woocommerce-checkout .wp-block-woocommerce-checkout {
  max-width: min(1280px, 96vw) !important;
  width: 100% !important;
  margin-inline: auto !important;
}

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
body.woocommerce-checkout .wc-block-components-checkout-step__title,
body.woocommerce-checkout .wp-block-woocommerce-checkout-order-summary-heading-block {
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

body.woocommerce-checkout #payment ul.payment_methods li.wc_payment_method > input[type="radio"]:checked + label,
body.woocommerce-checkout #payment ul.payment_methods li.payment_method_cod {
  font-weight: 800;
}

body.woocommerce-checkout #payment div.payment_box {
  background: var(--sokany-soft) !important;
  border-radius: 12px !important;
  color: var(--sokany-muted) !important;
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

@media (min-width: 992px) {
  body.woocommerce-checkout .woocommerce {
    display: grid !important;
    grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr) !important;
    gap: 24px !important;
    align-items: start !important;
  }

  body.woocommerce-checkout .woocommerce-notices-wrapper,
  body.woocommerce-checkout .woocommerce-form-login-toggle,
  body.woocommerce-checkout .woocommerce-form-coupon-toggle,
  body.woocommerce-checkout .checkout-inline-error-message {
    grid-column: 1 / -1;
  }

  body.woocommerce-checkout #customer_details {
    width: 100% !important;
    max-width: none !important;
    float: none !important;
  }

  body.woocommerce-checkout #order_review_heading,
  body.woocommerce-checkout #order_review {
    width: 100% !important;
    max-width: none !important;
    float: none !important;
  }

  body.woocommerce-checkout #order_review {
    position: sticky;
    top: 24px;
  }

  /* Classic Woo wraps columns inside form.checkout */
  body.woocommerce-checkout form.checkout {
    display: contents;
  }

  body.woocommerce-checkout .col2-set,
  body.woocommerce-checkout .col-1,
  body.woocommerce-checkout .col-2 {
    width: 100% !important;
    float: none !important;
    max-width: none !important;
  }
}

/* Thank you page soft polish */
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

/**
 * JS — persist classic + common checkout fields in localStorage.
 */
function sokany_cc11_js(): string {
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
    } catch (e) {
      // private mode / quota
    }
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
