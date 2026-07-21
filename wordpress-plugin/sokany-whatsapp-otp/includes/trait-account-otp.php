<?php
/**
 * WooCommerce My Account OTP login/register UI + cookie session endpoint.
 */

if (!defined('ABSPATH')) {
    exit;
}

trait Sokany_WhatsApp_OTP_Account_Trait {
    public static function register_account_hooks(): void {
        add_action('wp_enqueue_scripts', [__CLASS__, 'enqueue_account_otp_assets']);
        add_action('woocommerce_before_customer_login_form', [__CLASS__, 'render_account_otp_login_panel'], 5);
        add_action('woocommerce_register_form_start', [__CLASS__, 'render_account_otp_register_panel'], 5);
    }

    public static function register_account_routes(): void {
        register_rest_route('sokany-otp/v1', '/account-session', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'complete_account_session'],
            'permission_callback' => '__return_true',
        ]);
    }

    public static function enqueue_account_otp_assets(): void {
        if (is_admin() || is_user_logged_in()) {
            return;
        }

        $settings = self::settings();
        if (empty($settings['woo_account_otp_enabled'])) {
            return;
        }

        if (!function_exists('is_account_page') || !is_account_page()) {
            return;
        }

        $assets_base = trailingslashit(plugin_dir_url(__DIR__));

        wp_enqueue_style(
            'sokany-otp-account',
            $assets_base . 'assets/account-otp.css',
            [],
            self::VERSION
        );

        wp_enqueue_script(
            'sokany-otp-account',
            $assets_base . 'assets/account-otp.js',
            [],
            self::VERSION,
            true
        );

        wp_localize_script('sokany-otp-account', 'sokanyOtpAccount', [
            'restBase' => esc_url_raw(rest_url('sokany-otp/v1')),
            'restNonce' => wp_create_nonce('wp_rest'),
            'sessionNonce' => wp_create_nonce('sokany_account_session'),
            'redirectUrl' => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : home_url('/'),
            'i18n' => [
                'otpSent' => 'تم إرسال كود التحقق على واتساب.',
                'errorGeneric' => 'تعذر إكمال العملية. حاول مرة أخرى.',
            ],
        ]);
    }

    public static function render_account_otp_login_panel(): void {
        $settings = self::settings();
        if (empty($settings['woo_account_otp_enabled']) || is_user_logged_in()) {
            return;
        }
        ?>
        <div class="sokany-otp-panel" data-sokany-otp-login>
            <h3>تسجيل الدخول برمز واتساب</h3>
            <p class="description">أدخل رقم الموبايل لاستلام كود الدخول عبر واتساب. يمكنك أيضاً استخدام النموذج التقليدي بالأسفل.</p>
            <div class="sokany-otp-fields">
                <label>
                    رقم الموبايل
                    <input class="sokany-otp-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" />
                </label>
            </div>
            <div class="sokany-otp-actions">
                <button type="button" class="button sokany-otp-request">إرسال كود واتساب</button>
            </div>
            <div class="sokany-otp-step-code" hidden>
                <div class="sokany-otp-fields" style="margin-top:0.85rem;">
                    <label>
                        كود التحقق
                        <input class="sokany-otp-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" />
                    </label>
                </div>
                <div class="sokany-otp-actions">
                    <button type="button" class="button button-primary sokany-otp-verify">تأكيد الدخول</button>
                </div>
            </div>
            <div class="sokany-otp-status" hidden></div>
        </div>
        <?php
    }

    public static function render_account_otp_register_panel(): void {
        $settings = self::settings();
        if (empty($settings['woo_account_otp_enabled']) || is_user_logged_in()) {
            return;
        }
        ?>
        <div class="sokany-otp-panel" data-sokany-otp-register>
            <h3>إنشاء حساب برمز واتساب</h3>
            <p class="description">أدخل بياناتك ثم أكّد رقم الموبايل بكود واتساب. التسجيل التقليدي ما زال متاحاً.</p>
            <div class="sokany-otp-fields">
                <label>
                    الاسم
                    <input class="sokany-otp-name" type="text" autocomplete="name" />
                </label>
                <label>
                    البريد الإلكتروني
                    <input class="sokany-otp-email" type="email" autocomplete="email" />
                </label>
                <label>
                    رقم الموبايل
                    <input class="sokany-otp-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" />
                </label>
                <label>
                    كلمة المرور
                    <input class="sokany-otp-password" type="password" autocomplete="new-password" />
                </label>
            </div>
            <div class="sokany-otp-actions">
                <button type="button" class="button sokany-otp-request">إرسال كود واتساب</button>
            </div>
            <div class="sokany-otp-step-code" hidden>
                <div class="sokany-otp-fields" style="margin-top:0.85rem;">
                    <label>
                        كود التحقق
                        <input class="sokany-otp-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" />
                    </label>
                </div>
                <div class="sokany-otp-actions">
                    <button type="button" class="button button-primary sokany-otp-verify">تأكيد وإنشاء الحساب</button>
                </div>
            </div>
            <div class="sokany-otp-status" hidden></div>
        </div>
        <?php
    }

    public static function complete_account_session(WP_REST_Request $request) {
        $settings = self::settings();
        if (empty($settings['woo_account_otp_enabled'])) {
            return new WP_Error('sokany_account_otp_disabled', 'دخول OTP لواجهة ووردبريس غير مفعّل.', ['status' => 403]);
        }

        $nonce = (string) $request->get_param('nonce');
        if (!wp_verify_nonce($nonce, 'sokany_account_session')) {
            return new WP_Error('sokany_invalid_nonce', 'انتهت صلاحية الجلسة. حدّث الصفحة وحاول مرة أخرى.', ['status' => 403]);
        }

        $phone = self::normalize_phone((string) $request->get_param('phone'));
        $token = (string) $request->get_param('token');
        $purpose = self::sanitize_purpose((string) $request->get_param('purpose'));

        if (!$phone || !$token || !in_array($purpose, ['login', 'register'], true)) {
            return new WP_Error('sokany_invalid_session_payload', 'بيانات الجلسة غير مكتملة.', ['status' => 400]);
        }

        $token_data = self::verify_action_token($token, $phone, $purpose);
        if (is_wp_error($token_data)) {
            return $token_data;
        }

        $token_fingerprint = hash('sha256', $token);
        $used_key = 'sokany_otp_token_used_' . $token_fingerprint;
        if (get_transient($used_key)) {
            return new WP_Error('sokany_token_reused', 'تم استخدام رمز التحقق مسبقاً.', ['status' => 409]);
        }
        set_transient($used_key, 1, self::TOKEN_TTL);

        if ($purpose === 'login') {
            $user = self::find_user_by_phone($phone);
            if (!$user) {
                return new WP_Error('sokany_user_not_found', 'لا يوجد حساب بهذا الرقم.', ['status' => 404]);
            }
        } else {
            $name = sanitize_text_field((string) $request->get_param('name'));
            $email = sanitize_email((string) $request->get_param('email'));
            $password = (string) $request->get_param('password');

            if (!$name || !$email || strlen($password) < 8) {
                return new WP_Error('sokany_invalid_register_payload', 'الاسم والبريد وكلمة المرور مطلوبة.', ['status' => 400]);
            }

            if (email_exists($email)) {
                return new WP_Error('sokany_email_exists', 'يوجد حساب بالفعل بهذا البريد.', ['status' => 409]);
            }

            if (self::find_user_by_phone($phone)) {
                return new WP_Error('sokany_phone_exists', 'يوجد حساب بالفعل بهذا الرقم.', ['status' => 409]);
            }

            $parts = preg_split('/\s+/', trim($name));
            $first_name = $parts[0] ?? $name;
            $last_name = trim(str_replace($first_name, '', $name));
            $user_id = wp_create_user($email, $password, $email);

            if (is_wp_error($user_id)) {
                return $user_id;
            }

            wp_update_user([
                'ID' => $user_id,
                'display_name' => $name,
                'first_name' => $first_name,
                'last_name' => $last_name,
                'role' => 'customer',
            ]);

            self::persist_user_phone_meta((int) $user_id, $phone);
            update_user_meta($user_id, 'billing_first_name', $first_name);
            update_user_meta($user_id, 'billing_last_name', $last_name);
            update_user_meta($user_id, 'billing_email', $email);

            $user = get_user_by('id', $user_id);
            if (!$user) {
                return new WP_Error('sokany_register_failed', 'تعذر إنشاء الحساب.', ['status' => 500]);
            }
        }

        wp_set_current_user((int) $user->ID);
        wp_set_auth_cookie((int) $user->ID, true);

        return rest_ensure_response([
            'ok' => true,
            'status' => $purpose === 'register' ? 'registered_and_logged_in' : 'logged_in',
            'userId' => (int) $user->ID,
            'redirect' => wc_get_page_permalink('myaccount'),
        ]);
    }
}
