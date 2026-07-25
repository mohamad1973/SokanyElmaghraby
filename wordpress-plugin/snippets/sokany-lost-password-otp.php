/**
 * Snippet Name: SOKANY Lost Password OTP (phone)
 * Description: Replaces WooCommerce lost-password email field with mobile + WhatsApp OTP.
 * Requires SOKANY WhatsApp OTP plugin v1.3.1+.
 *
 * Code Snippets: Do NOT paste a <?php opening tag — the plugin adds it automatically.
 * Paste from this comment block downward → Run everywhere → Activate.
 */

/**
 * True on WooCommerce lost-password endpoint.
 */
function sokany_snippet_is_lost_password_page(): bool {
    if (function_exists('is_wc_endpoint_url') && is_wc_endpoint_url('lost-password')) {
        return true;
    }

    if (function_exists('is_account_page') && is_account_page()) {
        global $wp;
        if (isset($wp->query_vars['lost-password'])) {
            return true;
        }
        if (isset($_GET['action']) && sanitize_key((string) $_GET['action']) === 'lostpassword') {
            return true;
        }
    }

    return false;
}

function sokany_snippet_register_url(): string {
    if (function_exists('wc_get_page_permalink')) {
        $myaccount = wc_get_page_permalink('myaccount');
        return $myaccount ? trailingslashit($myaccount) . '#customer_login' : home_url('/');
    }

    return wp_registration_url();
}

add_action('wp_enqueue_scripts', function () {
    if (is_admin() || is_user_logged_in() || !sokany_snippet_is_lost_password_page()) {
        return;
    }

    if (!class_exists('Sokany_WhatsApp_OTP')) {
        return;
    }

    $css = <<<'CSS'
.sokany-lost-otp-wrap{max-width:420px;margin:0 auto 1.5rem;padding:1.25rem;border:1px solid rgba(0,0,0,.08);border-radius:12px;background:#fff}
.sokany-lost-otp-wrap h3{margin:0 0 .5rem;font-size:1.15rem}
.sokany-lost-otp-wrap .description{margin:0 0 1rem;color:#555;line-height:1.6}
.sokany-lost-otp-wrap label{display:block;font-weight:700;margin-bottom:.75rem}
.sokany-lost-otp-wrap input[type=tel],.sokany-lost-otp-wrap input[type=text]{width:100%;margin-top:.35rem;padding:.65rem .75rem;border:1px solid rgba(0,0,0,.15);border-radius:8px}
.sokany-lost-otp-actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.75rem}
.sokany-lost-otp-status{margin-top:.85rem;padding:.65rem .75rem;border-radius:8px;font-size:.92rem;line-height:1.5}
.sokany-lost-otp-status.is-error{background:#fff1f0;color:#a8071a;border:1px solid #ffa39e}
.sokany-lost-otp-status.is-success{background:#f6ffed;color:#237804;border:1px solid #b7eb8f}
.sokany-lost-otp-status a{font-weight:700;text-decoration:underline}
body.woocommerce-account.woocommerce-lost-password form.woocommerce-ResetPassword.lost_reset_password,
body.woocommerce-account form.lost_reset_password{display:none!important}
CSS;

    wp_register_style('sokany-lost-password-otp', false, [], '1.0.0');
    wp_enqueue_style('sokany-lost-password-otp');
    wp_add_inline_style('sokany-lost-password-otp', $css);

    wp_register_script('sokany-lost-password-otp', false, [], '1.0.0', true);
    wp_enqueue_script('sokany-lost-password-otp');
    wp_localize_script('sokany-lost-password-otp', 'sokanyLostOtp', [
        'restBase' => esc_url_raw(rest_url('sokany-otp/v1')),
        'restNonce' => wp_create_nonce('wp_rest'),
        'sessionNonce' => wp_create_nonce('sokany_lost_password_session'),
        'redirectUrl' => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : home_url('/'),
        'registerUrl' => sokany_snippet_register_url(),
        'i18n' => [
            'otpSent' => 'تم إرسال كود التحقق على واتساب.',
            'errorGeneric' => 'تعذر إكمال العملية. حاول مرة أخرى.',
            'invalidPhone' => 'أدخل رقم موبايل صحيح يبدأ بـ 01 ويتكون من 11 رقماً.',
            'invalidOtp' => 'أدخل كود التحقق المكوّن من 6 أرقام.',
            'userNotFound' => 'لا يوجد حساب بهذا الرقم. برجاء إنشاء حساب جديد.',
            'registerCta' => 'إنشاء حساب / الاشتراك',
            'pluginMissing' => 'بلجن SOKANY WhatsApp OTP غير مفعّل.',
        ],
    ]);

    $js = <<<'JS'
(function () {
  "use strict";
  var cfg = window.sokanyLostOtp || {};
  var restBase = (cfg.restBase || "").replace(/\/$/, "");
  var i18n = cfg.i18n || {};

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function show(el, message, isError, html) {
    if (!el) return;
    if (html) {
      el.innerHTML = message || "";
    } else {
      el.textContent = message || "";
    }
    el.hidden = !message;
    el.classList.toggle("is-error", !!isError);
    el.classList.toggle("is-success", !!message && !isError);
  }

  function setBusy(button, busy) {
    if (!button) return;
    button.disabled = !!busy;
  }

  function normalizeLocalPhone(value) {
    var digits = String(value || "").replace(/\D+/g, "");
    if (digits.indexOf("20") === 0 && digits.length >= 12) {
      digits = "0" + digits.slice(2);
    }
    return digits;
  }

  function isValidEgPhone(value) {
    return /^01[0-9]{9}$/.test(normalizeLocalPhone(value));
  }

  async function postJson(url, body) {
    var response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-WP-Nonce": cfg.restNonce || "",
      },
      body: JSON.stringify(body || {}),
    });

    var data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      var message =
        (data && (data.message || (data.data && data.data.message))) ||
        i18n.errorGeneric ||
        "Request failed.";
      var err = new Error(message);
      err.code = data && data.code ? data.code : "";
      err.status = response.status;
      err.payload = data;
      throw err;
    }

    return data || {};
  }

  function showNotRegistered(statusEl) {
    var link = cfg.registerUrl || "/my-account/";
    var text = i18n.userNotFound || "لا يوجد حساب بهذا الرقم.";
    var cta = i18n.registerCta || "إنشاء حساب";
    show(
      statusEl,
      text + ' <a href="' + link.replace(/"/g, "&quot;") + '">' + cta + "</a>",
      true,
      true
    );
  }

  function wire(root) {
    var phoneInput = $(".sokany-lost-otp-phone", root);
    var codeInput = $(".sokany-lost-otp-code", root);
    var requestBtn = $(".sokany-lost-otp-request", root);
    var verifyBtn = $(".sokany-lost-otp-verify", root);
    var statusEl = $(".sokany-lost-otp-status", root);
    var stepCode = $(".sokany-lost-otp-step-code", root);
    var token = "";

    if (!requestBtn || !phoneInput) return;

    requestBtn.addEventListener("click", async function () {
      show(statusEl, "");
      var phone = normalizeLocalPhone(phoneInput.value);
      phoneInput.value = phone;

      if (!isValidEgPhone(phone)) {
        show(statusEl, i18n.invalidPhone || "Invalid phone", true);
        return;
      }

      setBusy(requestBtn, true);
      try {
        var data = await postJson(restBase + "/request", {
          phone: phone,
          purpose: "login",
        });

        if (data.ok === false) {
          if (data.status === "user_not_found" || /حساب/.test(String(data.message || ""))) {
            showNotRegistered(statusEl);
            return;
          }
          throw new Error(data.message || i18n.errorGeneric);
        }

        if (stepCode) stepCode.hidden = false;
        if (codeInput) codeInput.focus();
        show(statusEl, i18n.otpSent || "OTP sent", false);
      } catch (err) {
        if (err.status === 404 || /حساب|user_not_found/i.test(String(err.message || ""))) {
          showNotRegistered(statusEl);
        } else {
          show(statusEl, err.message || i18n.errorGeneric, true);
        }
      } finally {
        setBusy(requestBtn, false);
      }
    });

    if (!verifyBtn || !codeInput) return;

    verifyBtn.addEventListener("click", async function () {
      show(statusEl, "");
      var phone = normalizeLocalPhone(phoneInput.value);
      var otp = String(codeInput.value || "").replace(/\D+/g, "");

      if (!isValidEgPhone(phone)) {
        show(statusEl, i18n.invalidPhone || "Invalid phone", true);
        return;
      }
      if (otp.length < 4) {
        show(statusEl, i18n.invalidOtp || "Invalid OTP", true);
        return;
      }

      setBusy(verifyBtn, true);
      try {
        var verified = await postJson(restBase + "/verify", {
          phone: phone,
          purpose: "login",
          otp: otp,
        });
        token = verified.token || "";
        if (!token) {
          throw new Error(i18n.errorGeneric || "Missing token");
        }

        var session = await postJson(restBase + "/lost-password-session", {
          phone: phone,
          token: token,
          nonce: cfg.sessionNonce || "",
        });

        window.location.href = session.redirect || cfg.redirectUrl || "/my-account/";
      } catch (err) {
        if (err.status === 404 || /حساب|user_not_found/i.test(String(err.message || ""))) {
          showNotRegistered(statusEl);
        } else {
          show(statusEl, err.message || i18n.errorGeneric, true);
        }
      } finally {
        setBusy(verifyBtn, false);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-sokany-lost-otp]");
    if (root) wire(root);
  });
})();
JS;

    wp_add_inline_script('sokany-lost-password-otp', $js);
});

add_action('woocommerce_before_lost_password_form', function () {
    if (is_user_logged_in()) {
        return;
    }

    if (!class_exists('Sokany_WhatsApp_OTP')) {
        echo '<div class="woocommerce-error" role="alert">بلجن SOKANY WhatsApp OTP غير مفعّل. لا يمكن إرسال كود واتساب.</div>';
        return;
    }
    ?>
    <div class="sokany-lost-otp-wrap" data-sokany-lost-otp>
        <h3>استعادة الدخول برقم الموبايل</h3>
        <p class="description">أدخل رقم الموبايل المسجّل لاستلام كود واتساب والدخول إلى حسابك. إذا لم يكن الرقم مسجلاً سيُطلب منك إنشاء حساب.</p>
        <div class="sokany-lost-otp-fields">
            <label>
                رقم الموبايل
                <input class="sokany-lost-otp-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" maxlength="15" />
            </label>
        </div>
        <div class="sokany-lost-otp-actions">
            <button type="button" class="button sokany-lost-otp-request">إرسال كود واتساب</button>
        </div>
        <div class="sokany-lost-otp-step-code" hidden>
            <div class="sokany-lost-otp-fields">
                <label>
                    كود التحقق
                    <input class="sokany-lost-otp-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="8" />
                </label>
            </div>
            <div class="sokany-lost-otp-actions">
                <button type="button" class="button button-primary sokany-lost-otp-verify">تأكيد الدخول</button>
            </div>
        </div>
        <div class="sokany-lost-otp-status" hidden></div>
    </div>
    <?php
}, 5);

add_filter('woocommerce_lost_password_message', function ($message) {
    if (!class_exists('Sokany_WhatsApp_OTP')) {
        return $message;
    }

    return 'أدخل رقم الموبايل المسجّل على الحساب لإرسال كود التحقق عبر واتساب.';
});
