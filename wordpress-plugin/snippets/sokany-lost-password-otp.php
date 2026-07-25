/**
 * Snippet Name: SOKANY Lost Password OTP (standalone)
 * Description: نسيت كلمة المرور برقم الموبايل + واتساب OTP — مستقل عن بلجن OTP.
 * لا يغيّر تأكيد الأوردر. يعيد استخدام بيانات MazBot من إعدادات البلجن إن وُجدت.
 *
 * Code Snippets: لا تلصق <?php — الصق من هذا التعليق للأسفل → Run everywhere → Activate.
 */

if (!defined('ABSPATH')) {
    return;
}

/** Optional overrides. Leave empty to reuse option `sokany_whatsapp_otp_settings` (order plugin settings). */
const SOKANY_LOST_OTP_OVERRIDES = [
    // 'mode' => 'live', // test|live
    // 'mazbot_api_key' => '',
    // 'mazbot_email' => '',
    // 'mazbot_password' => '',
    // 'mazbot_template_id' => 1710, // OTP template only — NOT order template
    // 'mazbot_api_base' => 'https://mazbot.net/api',
];

const SOKANY_LOST_OTP_TTL = 5; // minutes
const SOKANY_LOST_OTP_RESEND = 60; // seconds
const SOKANY_LOST_OTP_DIGITS = 6;
const SOKANY_LOST_OTP_MAX_ATTEMPTS = 5;
const SOKANY_LOST_OTP_TOKEN_TTL = 900; // 15 minutes

function sokany_lost_otp_settings(): array {
    $from_plugin = get_option('sokany_whatsapp_otp_settings', []);
    if (!is_array($from_plugin)) {
        $from_plugin = [];
    }

    $defaults = [
        'mode' => 'live',
        'mazbot_api_base' => 'https://mazbot.net/api',
        'mazbot_api_key' => '',
        'mazbot_email' => '',
        'mazbot_password' => '',
        'mazbot_template_id' => 0,
        'mazbot_include_button' => false,
        'otp_digits' => SOKANY_LOST_OTP_DIGITS,
        'otp_ttl_minutes' => SOKANY_LOST_OTP_TTL,
        'resend_wait_seconds' => SOKANY_LOST_OTP_RESEND,
    ];

    $merged = array_merge($defaults, $from_plugin);
    foreach (SOKANY_LOST_OTP_OVERRIDES as $key => $value) {
        if ($value !== '' && $value !== null) {
            $merged[$key] = $value;
        }
    }

    return $merged;
}

function sokany_lost_otp_is_lost_password_page(): bool {
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

function sokany_lost_otp_register_url(): string {
    if (function_exists('wc_get_page_permalink')) {
        $myaccount = wc_get_page_permalink('myaccount');
        return $myaccount ? trailingslashit($myaccount) . '#customer_login' : home_url('/');
    }

    return wp_registration_url();
}

function sokany_lost_otp_normalize_phone(string $phone): string {
    $digits = preg_replace('/\D+/', '', $phone);
    if ($digits === null || $digits === '') {
        return '';
    }

    if (strpos($digits, '0') === 0 && strlen($digits) === 11) {
        $digits = '20' . substr($digits, 1);
    }

    return preg_match('/^\d{10,15}$/', $digits) ? $digits : '';
}

function sokany_lost_otp_local_phone(string $e164_digits): string {
    if (strpos($e164_digits, '20') === 0 && strlen($e164_digits) >= 12) {
        return '0' . substr($e164_digits, 2);
    }

    return $e164_digits;
}

function sokany_lost_otp_find_user(string $phone_e164): ?WP_User {
    $digits = preg_replace('/\D+/', '', $phone_e164);
    if ($digits === '') {
        return null;
    }

    $local = sokany_lost_otp_local_phone($digits);
    $national10 = '';
    if (strpos($digits, '20') === 0 && strlen($digits) >= 12) {
        $national10 = substr($digits, 2);
    } elseif (strpos($digits, '0') === 0 && strlen($digits) === 11) {
        $national10 = substr($digits, 1);
    } elseif (strlen($digits) === 10 && strpos($digits, '1') === 0) {
        $national10 = $digits;
        $local = '0' . $digits;
    }

    $candidates = array_values(array_unique(array_filter([
        $digits,
        '+' . $digits,
        $local,
        $national10 !== '' ? '20' . $national10 : '',
        $national10 !== '' ? '+20' . $national10 : '',
        $national10,
    ])));
    $meta_keys = ['billing_phone', 'phone', 'mobile'];

    foreach ($meta_keys as $meta_key) {
        foreach ($candidates as $candidate) {
            $users = get_users([
                'number' => 1,
                'meta_key' => $meta_key,
                'meta_value' => $candidate,
                'fields' => 'all',
            ]);
            if (!empty($users[0]) && $users[0] instanceof WP_User) {
                return $users[0];
            }
        }
    }

    $suffix = $national10 !== '' ? $national10 : (strlen($digits) >= 10 ? substr($digits, -10) : '');
    if ($suffix === '' || strlen($suffix) < 10) {
        return null;
    }

    global $wpdb;
    foreach ($meta_keys as $meta_key) {
        $user_id = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT user_id FROM {$wpdb->usermeta}
             WHERE meta_key = %s
               AND meta_value <> ''
               AND (
                 meta_value = %s
                 OR meta_value = %s
                 OR meta_value = %s
                 OR meta_value = %s
                 OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(meta_value,' ',''),'-',''),'+',''),'.',''),'(','') LIKE %s
               )
             LIMIT 1",
            $meta_key,
            $suffix,
            '0' . $suffix,
            '20' . $suffix,
            '+20' . $suffix,
            '%' . $wpdb->esc_like($suffix)
        ));

        if ($user_id > 0) {
            $user = get_user_by('id', $user_id);
            if ($user instanceof WP_User) {
                return $user;
            }
        }
    }

    return null;
}

function sokany_lost_otp_http_post(string $url, array $headers, array $payload) {
    $response = wp_remote_post($url, [
        'timeout' => 30,
        'headers' => $headers,
        'body' => wp_json_encode($payload),
    ]);

    if (is_wp_error($response)) {
        return $response;
    }

    $status = (int) wp_remote_retrieve_response_code($response);
    $body = (string) wp_remote_retrieve_body($response);
    $json = json_decode($body, true);

    return [$status, $body, is_array($json) ? $json : null];
}

function sokany_lost_otp_api_message($json, string $body): string {
    if (is_array($json)) {
        foreach (['message', 'error'] as $key) {
            if (!empty($json[$key]) && is_string($json[$key])) {
                return $json[$key];
            }
        }
    }

    $plain = trim(wp_strip_all_tags($body));
    return $plain !== '' ? substr($plain, 0, 200) : 'unknown_error';
}

function sokany_lost_otp_normalize_base(string $base): string {
    $base = trim($base);
    if ($base === '') {
        return 'https://mazbot.net/api';
    }
    $base = preg_replace('#/login(/login)*$#i', '', rtrim($base, '/')) ?: $base;
    if (preg_match('#^https?://[^/]+/[a-z]{2}$#i', $base)) {
        $base .= '/api';
    }
    return rtrim($base, '/');
}

function sokany_lost_otp_login_urls(): array {
    $settings = sokany_lost_otp_settings();
    $configured = sokany_lost_otp_normalize_base((string) ($settings['mazbot_api_base'] ?? 'https://mazbot.net/api'));
    $urls = [
        $configured . '/login',
        'https://mazbot.net/api/login',
        'https://mazbot.net/ar/api/login',
        'https://mazbot.net/en/api/login',
    ];

    $working = get_transient('sokany_lost_otp_api_base');
    if (is_string($working) && $working !== '') {
        array_unshift($urls, rtrim($working, '/') . '/login');
    }

    return array_values(array_unique($urls));
}

function sokany_lost_otp_get_jwt(bool $force = false) {
    if (!$force) {
        $cached = get_transient('sokany_lost_otp_jwt');
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }
    }

    $settings = sokany_lost_otp_settings();
    if (empty($settings['mazbot_api_key']) || empty($settings['mazbot_email']) || empty($settings['mazbot_password'])) {
        return new WP_Error('sokany_lost_otp_mazbot', 'إعدادات MazBot غير مكتملة. احفظ API Key/البريد/كلمة المرور في إعدادات واتساب أو في أعلى السنابت.', ['status' => 500]);
    }

    $headers = [
        'Accept' => 'application/json',
        'Content-Type' => 'application/json',
        'apikey' => (string) $settings['mazbot_api_key'],
    ];
    $payload = [
        'email' => (string) $settings['mazbot_email'],
        'password' => (string) $settings['mazbot_password'],
    ];

    $last_status = 0;
    $last_message = '';

    foreach (sokany_lost_otp_login_urls() as $url) {
        $result = sokany_lost_otp_http_post($url, $headers, $payload);
        if (is_wp_error($result)) {
            $last_message = $result->get_error_message();
            continue;
        }

        [$status, $body, $json] = $result;
        $api_message = sokany_lost_otp_api_message($json, $body);
        $token = is_array($json) ? (string) ($json['data']['token'] ?? '') : '';
        $success_flag = is_array($json) ? ($json['success'] ?? null) : null;

        if ($status >= 200 && $status < 300 && $token !== '' && $success_flag !== false) {
            set_transient('sokany_lost_otp_jwt', $token, 50 * MINUTE_IN_SECONDS);
            $base = sokany_lost_otp_normalize_base(preg_replace('#/login$#i', '', $url) ?: 'https://mazbot.net/api');
            set_transient('sokany_lost_otp_api_base', $base, DAY_IN_SECONDS);
            return $token;
        }

        $last_status = $status;
        $last_message = $api_message;
        if ($status !== 404) {
            break;
        }
    }

    return new WP_Error(
        'sokany_lost_otp_mazbot',
        'تعذر تسجيل الدخول إلى MazBot (HTTP ' . $last_status . '): ' . $last_message,
        ['status' => 502]
    );
}

function sokany_lost_otp_send_whatsapp(string $phone_e164, string $otp) {
    $settings = sokany_lost_otp_settings();

    if (($settings['mode'] ?? 'live') === 'test') {
        update_option('sokany_lost_otp_last_test', [
            'phone' => $phone_e164,
            'otp' => $otp,
            'at' => gmdate('c'),
        ], false);
        return true;
    }

    $template_id = (int) ($settings['mazbot_template_id'] ?? 0);
    if (empty($settings['mazbot_api_key']) || $template_id < 1) {
        return new WP_Error('sokany_lost_otp_mazbot', 'ضع Template ID لقالب OTP في إعدادات MazBot (ليس قالب تأكيد الأوردر).', ['status' => 500]);
    }

    $jwt = sokany_lost_otp_get_jwt();
    if (is_wp_error($jwt)) {
        return $jwt;
    }

    $payload = [
        'template_id' => $template_id,
        'mobile' => $phone_e164,
        'body_matchs' => ['1' => 'input_value'],
        'body_values' => ['1' => $otp],
    ];

    if (!empty($settings['mazbot_include_button'])) {
        $payload['button_matchs'] = ['1' => 'input_value'];
        $payload['button_values'] = ['1' => $otp];
    }

    $bases = [];
    $working = get_transient('sokany_lost_otp_api_base');
    if (is_string($working) && $working !== '') {
        $bases[] = rtrim($working, '/');
    }
    $bases[] = sokany_lost_otp_normalize_base((string) ($settings['mazbot_api_base'] ?? 'https://mazbot.net/api'));
    $bases[] = 'https://mazbot.net/api';
    $bases[] = 'https://mazbot.net/ar/api';
    $bases = array_values(array_unique($bases));

    $headers = [
        'Accept' => 'application/json',
        'Content-Type' => 'application/json',
        'apikey' => (string) $settings['mazbot_api_key'],
        'Authorization' => 'Bearer ' . $jwt,
    ];

    $last_status = 0;
    $last_message = '';

    for ($attempt = 0; $attempt < 2; $attempt++) {
        if ($attempt === 1) {
            delete_transient('sokany_lost_otp_jwt');
            $jwt = sokany_lost_otp_get_jwt(true);
            if (is_wp_error($jwt)) {
                return $jwt;
            }
            $headers['Authorization'] = 'Bearer ' . $jwt;
        }

        foreach ($bases as $base) {
            $result = sokany_lost_otp_http_post($base . '/send-template', $headers, $payload);
            if (is_wp_error($result)) {
                $last_message = $result->get_error_message();
                continue;
            }

            [$status, $body, $json] = $result;
            $api_message = sokany_lost_otp_api_message($json, $body);
            $success = is_array($json) ? ($json['success'] ?? null) : null;

            if ($status >= 200 && $status < 300 && $success === true) {
                set_transient('sokany_lost_otp_api_base', $base, DAY_IN_SECONDS);
                return true;
            }

            $last_status = $status;
            $last_message = $api_message;

            if ($status === 401) {
                break;
            }
        }
    }

    return new WP_Error(
        'sokany_lost_otp_mazbot',
        'تعذر إرسال واتساب عبر MazBot (' . $last_status . '): ' . $last_message,
        ['status' => 502]
    );
}

function sokany_lost_otp_store(string $phone_e164, string $otp, int $user_id): void {
    $settings = sokany_lost_otp_settings();
    $ttl = max(1, (int) ($settings['otp_ttl_minutes'] ?? SOKANY_LOST_OTP_TTL)) * MINUTE_IN_SECONDS;
    $key = 'sokany_lost_otp_code_' . md5($phone_e164);
    set_transient($key, [
        'hash' => wp_hash_password($otp),
        'user_id' => $user_id,
        'attempts' => 0,
        'created' => time(),
    ], $ttl);
    set_transient('sokany_lost_otp_sent_' . md5($phone_e164), 1, max(30, (int) ($settings['resend_wait_seconds'] ?? SOKANY_LOST_OTP_RESEND)));
}

function sokany_lost_otp_create_token(string $phone_e164, int $user_id): string {
    $token = wp_generate_password(32, false, false);
    set_transient('sokany_lost_otp_token_' . hash('sha256', $token), [
        'phone' => $phone_e164,
        'user_id' => $user_id,
    ], SOKANY_LOST_OTP_TOKEN_TTL);
    return $token;
}

function sokany_lost_otp_consume_token(string $token, string $phone_e164) {
    $key = 'sokany_lost_otp_token_' . hash('sha256', $token);
    $data = get_transient($key);
    if (!is_array($data) || empty($data['phone']) || empty($data['user_id'])) {
        return new WP_Error('sokany_lost_otp_token', 'رمز التحقق غير صالح أو منتهٍ.', ['status' => 400]);
    }
    if ((string) $data['phone'] !== $phone_e164) {
        return new WP_Error('sokany_lost_otp_token', 'رمز التحقق لا يطابق الرقم.', ['status' => 400]);
    }

    $used_key = 'sokany_lost_otp_used_' . hash('sha256', $token);
    if (get_transient($used_key)) {
        return new WP_Error('sokany_lost_otp_token', 'تم استخدام رمز التحقق مسبقاً.', ['status' => 409]);
    }
    set_transient($used_key, 1, SOKANY_LOST_OTP_TOKEN_TTL);
    delete_transient($key);

    return $data;
}

add_action('rest_api_init', function () {
    register_rest_route('sokany-lost-otp/v1', '/request', [
        'methods' => 'POST',
        'permission_callback' => '__return_true',
        'callback' => function (WP_REST_Request $request) {
            $phone_raw = (string) $request->get_param('phone');
            $phone = sokany_lost_otp_normalize_phone($phone_raw);
            if ($phone === '') {
                return new WP_Error('sokany_lost_otp_phone', 'رقم الموبايل غير صحيح.', ['status' => 400]);
            }

            $user = sokany_lost_otp_find_user($phone);
            if (!$user) {
                return rest_ensure_response([
                    'ok' => false,
                    'status' => 'user_not_found',
                    'message' => 'لا يوجد حساب بهذا الرقم. برجاء إنشاء حساب جديد.',
                ]);
            }

            if (get_transient('sokany_lost_otp_sent_' . md5($phone))) {
                return new WP_Error('sokany_lost_otp_rate', 'انتظر قليلاً قبل إعادة إرسال الكود.', ['status' => 429]);
            }

            $settings = sokany_lost_otp_settings();
            $digits = in_array((int) ($settings['otp_digits'] ?? 6), [4, 6], true) ? (int) $settings['otp_digits'] : 6;
            $otp = (string) random_int((int) pow(10, $digits - 1), (int) pow(10, $digits) - 1);

            sokany_lost_otp_store($phone, $otp, (int) $user->ID);
            $sent = sokany_lost_otp_send_whatsapp($phone, $otp);
            if (is_wp_error($sent)) {
                return $sent;
            }

            return rest_ensure_response([
                'ok' => true,
                'status' => 'otp_sent',
                'expiresInMinutes' => (int) ($settings['otp_ttl_minutes'] ?? SOKANY_LOST_OTP_TTL),
                'testMode' => ($settings['mode'] ?? 'live') === 'test',
            ]);
        },
    ]);

    register_rest_route('sokany-lost-otp/v1', '/verify', [
        'methods' => 'POST',
        'permission_callback' => '__return_true',
        'callback' => function (WP_REST_Request $request) {
            $phone = sokany_lost_otp_normalize_phone((string) $request->get_param('phone'));
            $otp = preg_replace('/\D+/', '', (string) $request->get_param('otp'));

            if ($phone === '' || $otp === '') {
                return new WP_Error('sokany_lost_otp_payload', 'رقم الموبايل وكود التحقق مطلوبان.', ['status' => 400]);
            }

            $key = 'sokany_lost_otp_code_' . md5($phone);
            $record = get_transient($key);
            if (!is_array($record) || empty($record['hash'])) {
                return new WP_Error('sokany_lost_otp_missing', 'لا يوجد كود تحقق صالح لهذا الرقم.', ['status' => 404]);
            }

            $attempts = (int) ($record['attempts'] ?? 0);
            if ($attempts >= SOKANY_LOST_OTP_MAX_ATTEMPTS) {
                return new WP_Error('sokany_lost_otp_attempts', 'تم تجاوز عدد المحاولات المسموح.', ['status' => 429]);
            }

            $record['attempts'] = $attempts + 1;
            set_transient($key, $record, SOKANY_LOST_OTP_TTL * MINUTE_IN_SECONDS);

            if (!wp_check_password($otp, (string) $record['hash'])) {
                return new WP_Error('sokany_lost_otp_invalid', 'كود التحقق غير صحيح.', ['status' => 400]);
            }

            delete_transient($key);
            $user_id = (int) ($record['user_id'] ?? 0);
            if ($user_id < 1) {
                $user = sokany_lost_otp_find_user($phone);
                $user_id = $user ? (int) $user->ID : 0;
            }
            if ($user_id < 1) {
                return new WP_Error('sokany_user_not_found', 'لا يوجد حساب بهذا الرقم.', ['status' => 404]);
            }

            return rest_ensure_response([
                'ok' => true,
                'status' => 'verified',
                'token' => sokany_lost_otp_create_token($phone, $user_id),
            ]);
        },
    ]);

    register_rest_route('sokany-lost-otp/v1', '/session', [
        'methods' => 'POST',
        'permission_callback' => '__return_true',
        'callback' => function (WP_REST_Request $request) {
            $nonce = (string) $request->get_param('nonce');
            if (!wp_verify_nonce($nonce, 'sokany_lost_otp_session')) {
                return new WP_Error('sokany_lost_otp_nonce', 'انتهت صلاحية الجلسة. حدّث الصفحة وحاول مرة أخرى.', ['status' => 403]);
            }

            $phone = sokany_lost_otp_normalize_phone((string) $request->get_param('phone'));
            $token = (string) $request->get_param('token');
            if ($phone === '' || $token === '') {
                return new WP_Error('sokany_lost_otp_payload', 'بيانات الجلسة غير مكتملة.', ['status' => 400]);
            }

            $data = sokany_lost_otp_consume_token($token, $phone);
            if (is_wp_error($data)) {
                return $data;
            }

            $user_id = (int) $data['user_id'];
            $user = get_user_by('id', $user_id);
            if (!$user) {
                return new WP_Error('sokany_user_not_found', 'لا يوجد حساب بهذا الرقم. برجاء إنشاء حساب جديد.', ['status' => 404]);
            }

            wp_set_current_user($user_id);
            wp_set_auth_cookie($user_id, true);

            return rest_ensure_response([
                'ok' => true,
                'status' => 'logged_in',
                'userId' => $user_id,
                'redirect' => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : home_url('/'),
            ]);
        },
    ]);
});

add_action('wp_enqueue_scripts', function () {
    if (is_admin() || is_user_logged_in() || !sokany_lost_otp_is_lost_password_page()) {
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

    wp_register_style('sokany-lost-password-otp', false, [], '2.0.0');
    wp_enqueue_style('sokany-lost-password-otp');
    wp_add_inline_style('sokany-lost-password-otp', $css);

    wp_register_script('sokany-lost-password-otp', false, [], '2.0.0', true);
    wp_enqueue_script('sokany-lost-password-otp');
    wp_localize_script('sokany-lost-password-otp', 'sokanyLostOtp', [
        'restBase' => esc_url_raw(rest_url('sokany-lost-otp/v1')),
        'restNonce' => wp_create_nonce('wp_rest'),
        'sessionNonce' => wp_create_nonce('sokany_lost_otp_session'),
        'redirectUrl' => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : home_url('/'),
        'registerUrl' => sokany_lost_otp_register_url(),
        'i18n' => [
            'otpSent' => 'تم إرسال كود التحقق على واتساب.',
            'errorGeneric' => 'تعذر إكمال العملية. حاول مرة أخرى.',
            'invalidPhone' => 'أدخل رقم موبايل صحيح يبدأ بـ 01 ويتكون من 11 رقماً.',
            'invalidOtp' => 'أدخل كود التحقق المكوّن من 6 أرقام.',
            'userNotFound' => 'لا يوجد حساب بهذا الرقم. برجاء إنشاء حساب جديد.',
            'registerCta' => 'إنشاء حساب / الاشتراك',
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
    return false;
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
        var data = await postJson(restBase + "/request", { phone: phone });
        if (data.ok === false) {
          if (isUserNotFound(data, null)) { showNotRegistered(statusEl); return; }
          throw new Error(data.message || i18n.errorGeneric);
        }
        if (stepCode) stepCode.hidden = false;
        if (codeInput) codeInput.focus();
        show(statusEl, i18n.otpSent || "OTP sent", false);
      } catch (err) {
        if (isUserNotFound(err.payload, err)) showNotRegistered(statusEl);
        else show(statusEl, err.message || i18n.errorGeneric, true);
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
        var verified = await postJson(restBase + "/verify", { phone: phone, otp: otp });
        var token = verified.token || "";
        if (!token) throw new Error(i18n.errorGeneric || "Missing token");

        var session = await postJson(restBase + "/session", {
          phone: phone,
          token: token,
          nonce: cfg.sessionNonce || "",
        });
        window.location.href = session.redirect || cfg.redirectUrl || "/my-account/";
      } catch (err) {
        if (isUserNotFound(err.payload, err)) showNotRegistered(statusEl);
        else show(statusEl, err.message || i18n.errorGeneric, true);
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

add_filter('woocommerce_lost_password_message', function () {
    return 'أدخل رقم الموبايل المسجّل على الحساب لإرسال كود التحقق عبر واتساب.';
});
