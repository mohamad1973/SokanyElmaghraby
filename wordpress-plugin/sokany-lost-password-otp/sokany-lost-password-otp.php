<?php
/**
 * Plugin Name: SOKANY Lost Password OTP
 * Description: واجهة نسيت كلمة المرور بموبايل + واتساب OTP على ووكومرس. يتطلب بلجن SOKANY WhatsApp OTP (1.2.3+).
 * Version: 1.0.0
 * Author: SOKANY Egypt
 * Requires Plugins: sokany-whatsapp-otp
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Sokany_Lost_Password_OTP_Plugin {
    public const VERSION = '1.0.0';

    public static function init(): void {
        add_action('admin_notices', [__CLASS__, 'admin_notice_missing_otp']);
        add_action('wp_ajax_sokany_lost_otp_session', [__CLASS__, 'session_ajax']);
        add_action('wp_ajax_nopriv_sokany_lost_otp_session', [__CLASS__, 'session_ajax']);
        add_action('wp_enqueue_scripts', [__CLASS__, 'enqueue_assets']);
        add_action('woocommerce_before_lost_password_form', [__CLASS__, 'render_panel'], 5);
        add_filter('woocommerce_lost_password_message', [__CLASS__, 'filter_message']);
    }

    public static function admin_notice_missing_otp(): void {
        if (!current_user_can('activate_plugins')) {
            return;
        }
        if (class_exists('Sokany_WhatsApp_OTP')) {
            return;
        }
        echo '<div class="notice notice-error"><p><strong>SOKANY Lost Password OTP:</strong> ثبّت وفعّل بلجن <code>SOKANY WhatsApp OTP</code> أولاً (ملف <code>sokany-whatsapp-otp-1.2.3.zip</code>) حتى يعمل إرسال واتساب وتأكيد الأوردر وOTP.</p></div>';
    }

    private static function is_lost_password_page(): bool {
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

    private static function register_url(): string {
        if (function_exists('wc_get_page_permalink')) {
            $myaccount = wc_get_page_permalink('myaccount');
            return $myaccount ? trailingslashit($myaccount) . '#customer_login' : home_url('/');
        }

        return wp_registration_url();
    }

    public static function session_ajax(): void {
        check_ajax_referer('sokany_lost_otp_session_ajax', 'nonce');

        if (!class_exists('Sokany_WhatsApp_OTP')) {
            wp_send_json([
                'ok' => false,
                'code' => 'sokany_plugin_missing',
                'message' => 'بلجن SOKANY WhatsApp OTP غير مفعّل.',
            ], 503);
        }

        $phone = isset($_POST['phone']) ? (string) wp_unslash($_POST['phone']) : '';
        $token = isset($_POST['token']) ? (string) wp_unslash($_POST['token']) : '';

        if ($phone === '' || $token === '') {
            wp_send_json([
                'ok' => false,
                'code' => 'sokany_invalid_session_payload',
                'message' => 'بيانات الجلسة غير مكتملة.',
            ], 400);
        }

        $response = wp_remote_post(rest_url('sokany-otp/v1/login'), [
            'timeout' => 30,
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ],
            'body' => wp_json_encode([
                'phone' => $phone,
                'token' => $token,
            ]),
        ]);

        if (is_wp_error($response)) {
            wp_send_json([
                'ok' => false,
                'code' => 'sokany_login_request_failed',
                'message' => 'تعذر التحقق من كود الدخول. حاول مرة أخرى.',
            ], 502);
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $raw = (string) wp_remote_retrieve_body($response);
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $data = [];
        }

        if ($status < 200 || $status >= 300 || empty($data['ok'])) {
            $code = isset($data['code']) ? (string) $data['code'] : 'sokany_login_failed';
            $message = isset($data['message']) ? (string) $data['message'] : 'تعذر تسجيل الدخول بعد التحقق.';
            $out = [
                'ok' => false,
                'code' => $code,
                'message' => $message,
            ];
            if ($code === 'sokany_user_not_found') {
                $out['status'] = 'user_not_found';
            }
            wp_send_json($out, $status >= 400 ? $status : 400);
        }

        $user_id = isset($data['userId']) ? (int) $data['userId'] : 0;
        $user = $user_id > 0 ? get_user_by('id', $user_id) : null;

        if (!$user && !empty($data['email'])) {
            $user = get_user_by('email', (string) $data['email']);
        }

        if (!$user) {
            wp_send_json([
                'ok' => false,
                'code' => 'sokany_user_not_found',
                'status' => 'user_not_found',
                'message' => 'لا يوجد حساب بهذا الرقم. برجاء إنشاء حساب جديد.',
            ], 404);
        }

        wp_set_current_user((int) $user->ID);
        wp_set_auth_cookie((int) $user->ID, true);

        wp_send_json([
            'ok' => true,
            'status' => 'logged_in',
            'userId' => (int) $user->ID,
            'redirect' => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : home_url('/'),
        ]);
    }

    public static function enqueue_assets(): void {
        if (is_admin() || is_user_logged_in() || !self::is_lost_password_page()) {
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

        wp_register_style('sokany-lost-password-otp', false, [], self::VERSION);
        wp_enqueue_style('sokany-lost-password-otp');
        wp_add_inline_style('sokany-lost-password-otp', $css);

        wp_register_script('sokany-lost-password-otp', false, [], self::VERSION, true);
        wp_enqueue_script('sokany-lost-password-otp');
        wp_localize_script('sokany-lost-password-otp', 'sokanyLostOtp', [
            'restBase' => esc_url_raw(rest_url('sokany-otp/v1')),
            'restNonce' => wp_create_nonce('wp_rest'),
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'ajaxNonce' => wp_create_nonce('sokany_lost_otp_session_ajax'),
            'redirectUrl' => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : home_url('/'),
            'registerUrl' => self::register_url(),
            'i18n' => [
                'otpSent' => 'تم إرسال كود التحقق على واتساب.',
                'errorGeneric' => 'تعذر إكمال العملية. حاول مرة أخرى.',
                'invalidPhone' => 'أدخل رقم موبايل صحيح يبدأ بـ 01 ويتكون من 11 رقماً.',
                'invalidOtp' => 'أدخل كود التحقق المكوّن من 6 أرقام.',
                'userNotFound' => 'لا يوجد حساب بهذا الرقم. برجاء إنشاء حساب جديد.',
                'registerCta' => 'إنشاء حساب / الاشتراك',
                'pluginMissing' => 'بلجن SOKANY WhatsApp OTP غير مفعّل.',
                'snippetMissing' => 'بلجن واجهة نسيت كلمة المرور غير مفعّل أو بلجن OTP غير موجود.',
            ],
        ]);

        $js = <<<'JS'
(function () {
  "use strict";
  var cfg = window.sokanyLostOtp || {};
  var restBase = (cfg.restBase || "").replace(/\/$/, "");
  var ajaxUrl = cfg.ajaxUrl || "/wp-admin/admin-ajax.php";
  var i18n = cfg.i18n || {};

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function show(el, message, isError, html) {
    if (!el) return;
    if (html) el.innerHTML = message || "";
    else el.textContent = message || "";
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

  function isUserNotFound(data, err) {
    if (data && data.status === "user_not_found") return true;
    if (err && err.code === "sokany_user_not_found") return true;
    if (data && data.code === "sokany_user_not_found") return true;
    return false;
  }

  function isRouteMissing(data, err) {
    var code = (data && data.code) || (err && err.code) || "";
    var message = ((data && data.message) || (err && err.message) || "").toString();
    if (code === "rest_no_route") return true;
    if (/لم يتم العثور على مسار/.test(message)) return true;
    if (/No route was found/i.test(message)) return true;
    return false;
  }

  function friendlyError(data, err) {
    if (isRouteMissing(data, err)) {
      return i18n.snippetMissing || "مسار OTP غير موجود. فعّل بلجن SOKANY WhatsApp OTP أولاً.";
    }
    return (data && data.message) || (err && err.message) || i18n.errorGeneric || "Request failed.";
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
    try { data = await response.json(); } catch (e) { data = null; }

    if (!response.ok) {
      var message =
        (data && (data.message || (data.data && data.data.message))) ||
        i18n.errorGeneric ||
        "Request failed.";
      var err = new Error(message);
      err.code = (data && data.code) || "";
      err.status = response.status;
      err.payload = data;
      throw err;
    }

    return data || {};
  }

  async function postSession(phone, token) {
    var body = new FormData();
    body.append("action", "sokany_lost_otp_session");
    body.append("nonce", cfg.ajaxNonce || "");
    body.append("phone", phone);
    body.append("token", token);

    var response = await fetch(ajaxUrl, {
      method: "POST",
      credentials: "same-origin",
      body: body,
    });

    var text = await response.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }

    if (!data || text === "0" || text === "-1") {
      var missing = new Error(i18n.snippetMissing || "Plugin missing");
      missing.code = "sokany_lost_otp_ajax_missing";
      missing.status = response.status || 404;
      missing.payload = { code: "sokany_lost_otp_ajax_missing", message: missing.message };
      throw missing;
    }

    if (!response.ok || data.ok === false) {
      var err = new Error(friendlyError(data, null));
      err.code = (data && data.code) || "";
      err.status = response.status;
      err.payload = data;
      throw err;
    }

    return data;
  }

  function showNotRegistered(statusEl) {
    var link = cfg.registerUrl || "/my-account/";
    var text = i18n.userNotFound || "لا يوجد حساب بهذا الرقم.";
    var cta = i18n.registerCta || "إنشاء حساب";
    show(statusEl, text + ' <a href="' + link.replace(/"/g, "&quot;") + '">' + cta + "</a>", true, true);
  }

  function wire(root) {
    var phoneInput = $(".sokany-lost-otp-phone", root);
    var codeInput = $(".sokany-lost-otp-code", root);
    var requestBtn = $(".sokany-lost-otp-request", root);
    var verifyBtn = $(".sokany-lost-otp-verify", root);
    var statusEl = $(".sokany-lost-otp-status", root);
    var stepCode = $(".sokany-lost-otp-step-code", root);

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
        var data = await postJson(restBase + "/request", { phone: phone, purpose: "login" });
        if (data.ok === false) {
          if (isUserNotFound(data, null)) { showNotRegistered(statusEl); return; }
          throw new Error(data.message || i18n.errorGeneric);
        }
        if (stepCode) stepCode.hidden = false;
        if (codeInput) codeInput.focus();
        show(statusEl, i18n.otpSent || "OTP sent", false);
      } catch (err) {
        if (isUserNotFound(err.payload, err)) showNotRegistered(statusEl);
        else show(statusEl, friendlyError(err.payload, err), true);
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
        var verified = await postJson(restBase + "/verify", { phone: phone, purpose: "login", otp: otp });
        var token = verified.token || "";
        if (!token) throw new Error(i18n.errorGeneric || "Missing token");
        var session = await postSession(phone, token);
        window.location.href = session.redirect || cfg.redirectUrl || "/my-account/";
      } catch (err) {
        if (isUserNotFound(err.payload, err)) showNotRegistered(statusEl);
        else show(statusEl, friendlyError(err.payload, err), true);
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
    }

    public static function render_panel(): void {
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
    }

    public static function filter_message(string $message): string {
        if (!class_exists('Sokany_WhatsApp_OTP')) {
            return $message;
        }

        return 'أدخل رقم الموبايل المسجّل على الحساب لإرسال كود التحقق عبر واتساب.';
    }
}

Sokany_Lost_Password_OTP_Plugin::init();
