/**
 * Snippet Name: SOKANY Cart + Checkout Style (Woo only)
 * Description: تنسيق صفحات السلة والدفع في ووردبريس ليقارب شكل Next + حفظ بيانات العميل تلقائياً.
 *
 * Code Snippets:
 * - Do NOT paste a <?php opening tag
 * - Run snippet: Only run on site front-end
 * - Activate
 *
 * Source: wordpress-plugin/snippets/sokany-cart-checkout-style.php
 * Does NOT touch Next.js / Vercel storefront.
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Only cart / checkout / order-received (thank you).
 */
function sokany_cc_is_target_page(): bool {
    if (!function_exists('is_cart') || !function_exists('is_checkout')) {
        return false;
    }

    return is_cart() || is_checkout();
}

add_action('wp_enqueue_scripts', function () {
    if (!sokany_cc_is_target_page()) {
        return;
    }

    wp_register_style('sokany-cc-style', false, [], '1.0.0');
    wp_enqueue_style('sokany-cc-style');
    wp_add_inline_style('sokany-cc-style', sokany_cc_css());

    wp_register_script('sokany-cc-script', false, [], '1.0.0', true);
    wp_enqueue_script('sokany-cc-script');
    wp_add_inline_script('sokany-cc-script', sokany_cc_js(), 'after');
}, 40);

/**
 * CSS — Cart + Checkout visual polish (Woo only).
 */
function sokany_cc_css(): string {
    return <<<'CSS'
:root {
  --sokany-lime: #daff00;
  --sokany-lime-dark: #c1e200;
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

/* ========== Cart page ========== */
body.woocommerce-cart .woocommerce,
body.woocommerce-cart .wp-block-woocommerce-cart {
  max-width: 920px;
  margin-inline: auto;
}

body.woocommerce-cart .woocommerce-cart-form,
body.woocommerce-cart .cart-collaterals,
body.woocommerce-cart .wp-block-woocommerce-cart-items-block,
body.woocommerce-cart .wp-block-woocommerce-cart-order-summary-block,
body.woocommerce-cart .wc-block-cart {
  background: var(--sokany-card);
  border: 1px solid var(--sokany-border);
  border-radius: var(--sokany-radius);
  box-shadow: var(--sokany-shadow);
}

body.woocommerce-cart .woocommerce-cart-form {
  padding: 18px 18px 8px;
  margin-bottom: 18px;
}

body.woocommerce-cart .cart-collaterals {
  padding: 18px;
}

body.woocommerce-cart table.shop_table {
  border: 0 !important;
  margin: 0 !important;
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
    display: grid;
    grid-template-columns: 1.35fr 0.85fr;
    gap: 20px;
    align-items: start;
  }

  body.woocommerce-cart .woocommerce-notices-wrapper,
  body.woocommerce-cart .woocommerce-form-coupon-toggle {
    grid-column: 1 / -1;
  }

  body.woocommerce-cart .woocommerce-cart-form {
    margin-bottom: 0;
  }

  body.woocommerce-cart .cart-collaterals {
    position: sticky;
    top: 24px;
  }

  body.woocommerce-cart .cart-collaterals .cart_totals {
    float: none !important;
    width: 100% !important;
  }
}

/* ========== Checkout page ========== */
body.woocommerce-checkout .woocommerce,
body.woocommerce-checkout .wp-block-woocommerce-checkout {
  max-width: 1080px;
  margin-inline: auto;
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
}

body.woocommerce-checkout #customer_details,
body.woocommerce-checkout .wp-block-woocommerce-checkout-fields-block,
body.woocommerce-checkout .wc-block-checkout__main {
  padding: 20px;
}

body.woocommerce-checkout #order_review,
body.woocommerce-checkout .wp-block-woocommerce-checkout-order-summary-block,
body.woocommerce-checkout .wc-block-checkout__sidebar {
  padding: 18px;
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
    grid-template-columns: 1.2fr 0.8fr;
    gap: 22px;
    align-items: start;
  }

  body.woocommerce-checkout .woocommerce-notices-wrapper,
  body.woocommerce-checkout .woocommerce-form-login-toggle,
  body.woocommerce-checkout .woocommerce-form-coupon-toggle,
  body.woocommerce-checkout .checkout-inline-error-message {
    grid-column: 1 / -1;
  }

  body.woocommerce-checkout #customer_details {
    width: 100% !important;
    float: none !important;
  }

  body.woocommerce-checkout #order_review_heading,
  body.woocommerce-checkout #order_review {
    width: 100% !important;
    float: none !important;
  }

  body.woocommerce-checkout #order_review {
    position: sticky;
    top: 24px;
  }

  /* Classic Woo often wraps both columns inside form.checkout */
  body.woocommerce-checkout form.checkout {
    display: contents;
  }
}

/* Thank you page soft polish */
body.woocommerce-order-received .woocommerce-order {
  max-width: 760px;
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
function sokany_cc_js(): string {
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
    "#billing_country",
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

  // Woo/Blocks may re-render fields
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
