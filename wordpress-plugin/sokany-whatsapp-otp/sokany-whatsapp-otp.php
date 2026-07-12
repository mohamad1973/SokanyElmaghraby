<?php
/**
 * Plugin Name: SOKANY WhatsApp OTP
 * Description: WhatsApp OTP authentication endpoints for WordPress/WooCommerce customers.
 * Version: 1.0.0
 * Author: SOKANY Egypt
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Sokany_WhatsApp_OTP {
    private const VERSION = '1.0.0';
    private const OPTION_KEY = 'sokany_whatsapp_otp_settings';
    private const LAST_TEST_OTP_OPTION = 'sokany_whatsapp_otp_last_test';
    private const TOKEN_TTL = 600;

    public static function init(): void {
        register_activation_hook(__FILE__, [__CLASS__, 'activate']);
        add_action('admin_menu', [__CLASS__, 'register_admin_menu']);
        add_action('admin_init', [__CLASS__, 'register_settings']);
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
    }

    public static function activate(): void {
        global $wpdb;

        $table = self::table_name();
        $charset_collate = $wpdb->get_charset_collate();

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        dbDelta("CREATE TABLE {$table} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            phone VARCHAR(32) NOT NULL,
            user_id BIGINT UNSIGNED NULL,
            purpose VARCHAR(32) NOT NULL,
            otp_hash VARCHAR(255) NOT NULL,
            attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
            max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 5,
            expires_at DATETIME NOT NULL,
            verified_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY phone_purpose (phone, purpose),
            KEY expires_at (expires_at)
        ) {$charset_collate};");
    }

    private static function table_name(): string {
        global $wpdb;

        return $wpdb->prefix . 'sokany_otp_codes';
    }

    public static function defaults(): array {
        return [
            'mode' => 'test',
            'otp_digits' => 6,
            'otp_ttl_minutes' => 5,
            'resend_wait_seconds' => 60,
            'api_base_url' => '',
            'api_token' => '',
            'api_token_header' => 'Authorization',
            'api_token_prefix' => 'Bearer',
            'sender_id' => '',
            'template_name' => 'otp_code',
            'template_language' => 'ar',
        ];
    }

    public static function settings(): array {
        $settings = get_option(self::OPTION_KEY, []);

        return array_merge(self::defaults(), is_array($settings) ? $settings : []);
    }

    public static function register_admin_menu(): void {
        add_options_page(
            'SOKANY WhatsApp OTP',
            'SOKANY WhatsApp OTP',
            'manage_options',
            'sokany-whatsapp-otp',
            [__CLASS__, 'render_settings_page']
        );
    }

    public static function register_settings(): void {
        register_setting('sokany_whatsapp_otp', self::OPTION_KEY, [
            'sanitize_callback' => [__CLASS__, 'sanitize_settings'],
            'default' => self::defaults(),
        ]);
    }

    public static function sanitize_settings($settings): array {
        $settings = is_array($settings) ? $settings : [];
        $defaults = self::defaults();

        return [
            'mode' => in_array($settings['mode'] ?? '', ['test', 'live'], true) ? $settings['mode'] : $defaults['mode'],
            'otp_digits' => in_array((int) ($settings['otp_digits'] ?? 6), [4, 6], true) ? (int) $settings['otp_digits'] : 6,
            'otp_ttl_minutes' => max(1, min(30, (int) ($settings['otp_ttl_minutes'] ?? 5))),
            'resend_wait_seconds' => max(30, min(600, (int) ($settings['resend_wait_seconds'] ?? 60))),
            'api_base_url' => esc_url_raw((string) ($settings['api_base_url'] ?? '')),
            'api_token' => sanitize_text_field((string) ($settings['api_token'] ?? '')),
            'api_token_header' => sanitize_key((string) ($settings['api_token_header'] ?? 'Authorization')),
            'api_token_prefix' => sanitize_text_field((string) ($settings['api_token_prefix'] ?? 'Bearer')),
            'sender_id' => sanitize_text_field((string) ($settings['sender_id'] ?? '')),
            'template_name' => sanitize_text_field((string) ($settings['template_name'] ?? 'otp_code')),
            'template_language' => sanitize_text_field((string) ($settings['template_language'] ?? 'ar')),
        ];
    }

    public static function render_settings_page(): void {
        if (!current_user_can('manage_options')) {
            return;
        }

        $settings = self::settings();
        $last_test = get_option(self::LAST_TEST_OTP_OPTION, []);
        ?>
        <div class="wrap" dir="rtl">
            <h1>SOKANY WhatsApp OTP</h1>
            <p>هذا البلجن يجهز نظام OTP كامل داخل ووردبريس. استخدم Test Mode الآن، وبعد استلام API من Direct Tech غيّر الوضع إلى Live.</p>

            <?php if (!empty($last_test['code'])) : ?>
                <div class="notice notice-info">
                    <p><strong>آخر كود اختبار:</strong> <?php echo esc_html($last_test['code']); ?> - رقم: <?php echo esc_html($last_test['phone'] ?? ''); ?> - الغرض: <?php echo esc_html($last_test['purpose'] ?? ''); ?></p>
                </div>
            <?php endif; ?>

            <form method="post" action="options.php">
                <?php settings_fields('sokany_whatsapp_otp'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row">وضع الإرسال</th>
                        <td>
                            <select name="<?php echo esc_attr(self::OPTION_KEY); ?>[mode]">
                                <option value="test" <?php selected($settings['mode'], 'test'); ?>>Test Mode - بدون إرسال واتساب حقيقي</option>
                                <option value="live" <?php selected($settings['mode'], 'live'); ?>>Live Mode - إرسال عبر API</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">عدد أرقام OTP</th>
                        <td>
                            <select name="<?php echo esc_attr(self::OPTION_KEY); ?>[otp_digits]">
                                <option value="4" <?php selected((int) $settings['otp_digits'], 4); ?>>4</option>
                                <option value="6" <?php selected((int) $settings['otp_digits'], 6); ?>>6</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">صلاحية الكود بالدقائق</th>
                        <td><input type="number" min="1" max="30" name="<?php echo esc_attr(self::OPTION_KEY); ?>[otp_ttl_minutes]" value="<?php echo esc_attr($settings['otp_ttl_minutes']); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row">منع إعادة الإرسال بالثواني</th>
                        <td><input type="number" min="30" max="600" name="<?php echo esc_attr(self::OPTION_KEY); ?>[resend_wait_seconds]" value="<?php echo esc_attr($settings['resend_wait_seconds']); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row">API Base URL</th>
                        <td><input type="url" class="regular-text" name="<?php echo esc_attr(self::OPTION_KEY); ?>[api_base_url]" value="<?php echo esc_attr($settings['api_base_url']); ?>" placeholder="https://api.direct-tech.example/messages" /></td>
                    </tr>
                    <tr>
                        <th scope="row">API Token</th>
                        <td><input type="password" class="regular-text" name="<?php echo esc_attr(self::OPTION_KEY); ?>[api_token]" value="<?php echo esc_attr($settings['api_token']); ?>" autocomplete="new-password" /></td>
                    </tr>
                    <tr>
                        <th scope="row">Token Header</th>
                        <td><input type="text" name="<?php echo esc_attr(self::OPTION_KEY); ?>[api_token_header]" value="<?php echo esc_attr($settings['api_token_header']); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row">Token Prefix</th>
                        <td><input type="text" name="<?php echo esc_attr(self::OPTION_KEY); ?>[api_token_prefix]" value="<?php echo esc_attr($settings['api_token_prefix']); ?>" placeholder="Bearer" /></td>
                    </tr>
                    <tr>
                        <th scope="row">Sender ID / Phone Number ID</th>
                        <td><input type="text" class="regular-text" name="<?php echo esc_attr(self::OPTION_KEY); ?>[sender_id]" value="<?php echo esc_attr($settings['sender_id']); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row">Template Name</th>
                        <td><input type="text" name="<?php echo esc_attr(self::OPTION_KEY); ?>[template_name]" value="<?php echo esc_attr($settings['template_name']); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row">Template Language</th>
                        <td><input type="text" name="<?php echo esc_attr(self::OPTION_KEY); ?>[template_language]" value="<?php echo esc_attr($settings['template_language']); ?>" /></td>
                    </tr>
                </table>
                <?php submit_button('حفظ الإعدادات'); ?>
            </form>

            <h2>Endpoints الجاهزة</h2>
            <ul>
                <li><code>POST /wp-json/sokany-otp/v1/request</code></li>
                <li><code>POST /wp-json/sokany-otp/v1/verify</code></li>
                <li><code>POST /wp-json/sokany-otp/v1/reset-password</code></li>
                <li><code>POST /wp-json/sokany-otp/v1/register</code></li>
                <li><code>POST /wp-json/sokany-otp/v1/login</code></li>
                <li><code>POST /wp-json/sokany-otp/v1/change-password</code></li>
            </ul>
        </div>
        <?php
    }

    public static function register_routes(): void {
        register_rest_route('sokany-otp/v1', '/request', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'request_otp'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route('sokany-otp/v1', '/verify', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'verify_otp'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route('sokany-otp/v1', '/reset-password', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'reset_password'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route('sokany-otp/v1', '/register', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'register_customer'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route('sokany-otp/v1', '/login', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'complete_login'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route('sokany-otp/v1', '/change-password', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'change_password'],
            'permission_callback' => '__return_true',
        ]);
    }

    public static function request_otp(WP_REST_Request $request) {
        $phone = self::normalize_phone((string) $request->get_param('phone'));
        $purpose = self::sanitize_purpose((string) $request->get_param('purpose'));

        if (!$phone) {
            return new WP_Error('sokany_invalid_phone', 'رقم الموبايل غير صحيح.', ['status' => 400]);
        }

        $user = self::find_user_by_phone($phone);

        if (in_array($purpose, ['reset_password', 'login'], true) && !$user) {
            return rest_ensure_response([
                'ok' => false,
                'status' => 'user_not_found',
                'message' => 'لا يوجد حساب بهذا الرقم. برجاء إنشاء حساب جديد.',
            ]);
        }

        if ($purpose === 'register' && $user) {
            return rest_ensure_response([
                'ok' => false,
                'status' => 'user_exists',
                'message' => 'يوجد حساب بالفعل بهذا الرقم. برجاء تسجيل الدخول أو إعادة تعيين كلمة المرور.',
            ]);
        }

        $rate_limit = self::rate_limit_message($phone, $purpose);
        if ($rate_limit) {
            return new WP_Error('sokany_otp_rate_limited', $rate_limit, ['status' => 429]);
        }

        $settings = self::settings();
        $otp = self::generate_otp((int) $settings['otp_digits']);
        self::store_otp($phone, $purpose, $otp, $user ? (int) $user->ID : null);

        $sent = self::send_whatsapp_otp($phone, $otp, $purpose);

        if (is_wp_error($sent)) {
            return $sent;
        }

        return rest_ensure_response([
            'ok' => true,
            'status' => 'otp_sent',
            'purpose' => $purpose,
            'expiresInMinutes' => (int) $settings['otp_ttl_minutes'],
            'testMode' => $settings['mode'] === 'test',
        ]);
    }

    public static function verify_otp(WP_REST_Request $request) {
        $phone = self::normalize_phone((string) $request->get_param('phone'));
        $purpose = self::sanitize_purpose((string) $request->get_param('purpose'));
        $otp = preg_replace('/\D+/', '', (string) $request->get_param('otp'));

        if (!$phone || !$otp) {
            return new WP_Error('sokany_invalid_otp_payload', 'رقم الموبايل وكود التحقق مطلوبان.', ['status' => 400]);
        }

        $record = self::get_latest_otp($phone, $purpose);

        if (!$record) {
            return new WP_Error('sokany_otp_not_found', 'لا يوجد كود تحقق صالح لهذا الرقم.', ['status' => 404]);
        }

        if ((int) $record->attempts >= (int) $record->max_attempts) {
            return new WP_Error('sokany_otp_attempts_exceeded', 'تم تجاوز عدد المحاولات المسموح.', ['status' => 429]);
        }

        if (strtotime($record->expires_at) < time()) {
            return new WP_Error('sokany_otp_expired', 'انتهت صلاحية كود التحقق.', ['status' => 410]);
        }

        self::increment_attempts((int) $record->id);

        if (!wp_check_password($otp, $record->otp_hash)) {
            return new WP_Error('sokany_invalid_otp', 'كود التحقق غير صحيح.', ['status' => 400]);
        }

        self::mark_verified((int) $record->id);

        return rest_ensure_response([
            'ok' => true,
            'status' => 'verified',
            'purpose' => $purpose,
            'token' => self::create_action_token($phone, $purpose, (int) $record->id),
        ]);
    }

    public static function reset_password(WP_REST_Request $request) {
        $phone = self::normalize_phone((string) $request->get_param('phone'));
        $token = (string) $request->get_param('token');
        $password = (string) $request->get_param('password');

        if (strlen($password) < 8) {
            return new WP_Error('sokany_weak_password', 'كلمة المرور يجب ألا تقل عن 8 أحرف.', ['status' => 400]);
        }

        $token_data = self::verify_action_token($token, $phone, 'reset_password');

        if (is_wp_error($token_data)) {
            return $token_data;
        }

        $user = self::find_user_by_phone($phone);

        if (!$user) {
            return new WP_Error('sokany_user_not_found', 'لا يوجد حساب بهذا الرقم.', ['status' => 404]);
        }

        wp_set_password($password, (int) $user->ID);

        return rest_ensure_response([
            'ok' => true,
            'status' => 'password_reset',
        ]);
    }

    public static function complete_login(WP_REST_Request $request) {
        $phone = self::normalize_phone((string) $request->get_param('phone'));
        $token = (string) $request->get_param('token');

        if (!$phone || !$token) {
            return new WP_Error('sokany_invalid_login_payload', 'رقم الموبايل ورمز التحقق مطلوبان.', ['status' => 400]);
        }

        $token_data = self::verify_action_token($token, $phone, 'login');

        if (is_wp_error($token_data)) {
            return $token_data;
        }

        $user = self::find_user_by_phone($phone);

        if (!$user) {
            return new WP_Error('sokany_user_not_found', 'لا يوجد حساب بهذا الرقم.', ['status' => 404]);
        }

        return rest_ensure_response([
            'ok' => true,
            'status' => 'logged_in',
            'userId' => (int) $user->ID,
            'email' => $user->user_email,
            'name' => $user->display_name ?: $user->user_login,
            'phone' => $phone,
        ]);
    }

    public static function change_password(WP_REST_Request $request) {
        $email = sanitize_email((string) $request->get_param('email'));
        $current_password = (string) $request->get_param('currentPassword');
        $new_password = (string) $request->get_param('newPassword');

        if (!$email || !$current_password) {
            return new WP_Error('sokany_invalid_change_password_payload', 'البريد وكلمة المرور الحالية مطلوبان.', ['status' => 400]);
        }

        if (strlen($new_password) < 8) {
            return new WP_Error('sokany_weak_password', 'كلمة المرور يجب ألا تقل عن 8 أحرف.', ['status' => 400]);
        }

        $user = wp_authenticate($email, $current_password);

        if (is_wp_error($user)) {
            return new WP_Error('sokany_invalid_current_password', 'كلمة المرور الحالية غير صحيحة.', ['status' => 401]);
        }

        wp_set_password($new_password, (int) $user->ID);

        return rest_ensure_response([
            'ok' => true,
            'status' => 'password_changed',
        ]);
    }

    public static function register_customer(WP_REST_Request $request) {
        $phone = self::normalize_phone((string) $request->get_param('phone'));
        $token = (string) $request->get_param('token');
        $email = sanitize_email((string) $request->get_param('email'));
        $password = (string) $request->get_param('password');
        $name = sanitize_text_field((string) $request->get_param('name'));

        if (!$phone || !$email || strlen($password) < 8 || !$name) {
            return new WP_Error('sokany_invalid_register_payload', 'الاسم والبريد ورقم الموبايل وكلمة المرور مطلوبة.', ['status' => 400]);
        }

        if (email_exists($email)) {
            return new WP_Error('sokany_email_exists', 'يوجد حساب بالفعل بهذا البريد.', ['status' => 409]);
        }

        if (self::find_user_by_phone($phone)) {
            return new WP_Error('sokany_phone_exists', 'يوجد حساب بالفعل بهذا الرقم.', ['status' => 409]);
        }

        $token_data = self::verify_action_token($token, $phone, 'register');

        if (is_wp_error($token_data)) {
            return $token_data;
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

        update_user_meta($user_id, 'billing_phone', $phone);
        update_user_meta($user_id, 'phone', $phone);
        update_user_meta($user_id, 'mobile', $phone);
        update_user_meta($user_id, 'billing_first_name', $first_name);
        update_user_meta($user_id, 'billing_last_name', $last_name);
        update_user_meta($user_id, 'billing_email', $email);

        return rest_ensure_response([
            'ok' => true,
            'status' => 'registered',
            'userId' => (int) $user_id,
        ]);
    }

    private static function sanitize_purpose(string $purpose): string {
        return in_array($purpose, ['reset_password', 'register', 'login'], true) ? $purpose : 'reset_password';
    }

    private static function normalize_phone(string $phone): string {
        $phone = preg_replace('/[^\d+]/', '', $phone);

        if (self::starts_with($phone, '+')) {
            $phone = substr($phone, 1);
        }

        if (self::starts_with($phone, '00')) {
            $phone = substr($phone, 2);
        }

        if (self::starts_with($phone, '0') && strlen($phone) === 11) {
            $phone = '20' . substr($phone, 1);
        }

        return preg_match('/^\d{10,15}$/', $phone) ? $phone : '';
    }

    private static function find_user_by_phone(string $phone): ?WP_User {
        $local_phone = self::starts_with($phone, '20') ? '0' . substr($phone, 2) : $phone;
        $candidates = array_values(array_unique([$phone, '+' . $phone, $local_phone]));
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

        return null;
    }

    private static function generate_otp(int $digits): string {
        $digits = in_array($digits, [4, 6], true) ? $digits : 6;
        $min = (int) pow(10, $digits - 1);
        $max = (int) pow(10, $digits) - 1;

        return (string) random_int($min, $max);
    }

    private static function store_otp(string $phone, string $purpose, string $otp, ?int $user_id): void {
        global $wpdb;

        $settings = self::settings();
        $expires_at = gmdate('Y-m-d H:i:s', time() + ((int) $settings['otp_ttl_minutes'] * MINUTE_IN_SECONDS));

        $wpdb->insert(self::table_name(), [
            'phone' => $phone,
            'user_id' => $user_id,
            'purpose' => $purpose,
            'otp_hash' => wp_hash_password($otp),
            'attempts' => 0,
            'max_attempts' => 5,
            'expires_at' => $expires_at,
            'verified_at' => null,
            'created_at' => gmdate('Y-m-d H:i:s'),
        ], ['%s', '%d', '%s', '%s', '%d', '%d', '%s', '%s', '%s']);
    }

    private static function rate_limit_message(string $phone, string $purpose): string {
        global $wpdb;

        $settings = self::settings();
        $wait = (int) $settings['resend_wait_seconds'];
        $threshold = gmdate('Y-m-d H:i:s', time() - $wait);
        $table = self::table_name();
        $recent = $wpdb->get_var($wpdb->prepare(
            "SELECT created_at FROM {$table} WHERE phone = %s AND purpose = %s AND created_at >= %s ORDER BY id DESC LIMIT 1",
            $phone,
            $purpose,
            $threshold
        ));

        return $recent ? 'برجاء الانتظار قبل طلب كود جديد.' : '';
    }

    private static function get_latest_otp(string $phone, string $purpose) {
        global $wpdb;

        $table = self::table_name();

        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE phone = %s AND purpose = %s AND verified_at IS NULL ORDER BY id DESC LIMIT 1",
            $phone,
            $purpose
        ));
    }

    private static function increment_attempts(int $id): void {
        global $wpdb;

        $wpdb->query($wpdb->prepare(
            'UPDATE ' . self::table_name() . ' SET attempts = attempts + 1 WHERE id = %d',
            $id
        ));
    }

    private static function mark_verified(int $id): void {
        global $wpdb;

        $wpdb->update(self::table_name(), ['verified_at' => gmdate('Y-m-d H:i:s')], ['id' => $id], ['%s'], ['%d']);
    }

    private static function create_action_token(string $phone, string $purpose, int $otp_id): string {
        $payload = [
            'phone' => $phone,
            'purpose' => $purpose,
            'otpId' => $otp_id,
            'exp' => time() + self::TOKEN_TTL,
        ];
        $encoded = self::base64_url_encode(wp_json_encode($payload));
        $signature = hash_hmac('sha256', $encoded, wp_salt('auth'));

        return $encoded . '.' . $signature;
    }

    private static function verify_action_token(string $token, string $phone, string $purpose) {
        $parts = explode('.', $token);

        if (count($parts) !== 2) {
            return new WP_Error('sokany_invalid_token', 'رمز التحقق غير صالح.', ['status' => 400]);
        }

        [$encoded, $signature] = $parts;
        $expected = hash_hmac('sha256', $encoded, wp_salt('auth'));

        if (!hash_equals($expected, $signature)) {
            return new WP_Error('sokany_invalid_token_signature', 'رمز التحقق غير صالح.', ['status' => 400]);
        }

        $payload = json_decode(self::base64_url_decode($encoded), true);

        if (!is_array($payload) || ($payload['phone'] ?? '') !== $phone || ($payload['purpose'] ?? '') !== $purpose || (int) ($payload['exp'] ?? 0) < time()) {
            return new WP_Error('sokany_expired_token', 'انتهت صلاحية جلسة التحقق.', ['status' => 410]);
        }

        return $payload;
    }

    private static function base64_url_encode(string $value): string {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function base64_url_decode(string $value): string {
        $padding = strlen($value) % 4;

        if ($padding) {
            $value .= str_repeat('=', 4 - $padding);
        }

        return base64_decode(strtr($value, '-_', '+/'));
    }

    private static function starts_with(string $value, string $prefix): bool {
        return substr($value, 0, strlen($prefix)) === $prefix;
    }

    private static function send_whatsapp_otp(string $phone, string $otp, string $purpose) {
        $settings = self::settings();

        if ($settings['mode'] === 'test') {
            update_option(self::LAST_TEST_OTP_OPTION, [
                'phone' => $phone,
                'code' => $otp,
                'purpose' => $purpose,
                'createdAt' => current_time('mysql'),
            ], false);

            return true;
        }

        if (empty($settings['api_base_url']) || empty($settings['api_token'])) {
            return new WP_Error('sokany_whatsapp_not_configured', 'بيانات WhatsApp API غير مكتملة.', ['status' => 500]);
        }

        $headers = ['Content-Type' => 'application/json'];
        $token_value = trim($settings['api_token_prefix'] . ' ' . $settings['api_token']);
        $headers[$settings['api_token_header'] ?: 'Authorization'] = $token_value;

        $response = wp_remote_post($settings['api_base_url'], [
            'timeout' => 20,
            'headers' => $headers,
            'body' => wp_json_encode([
                'to' => $phone,
                'sender' => $settings['sender_id'],
                'template' => $settings['template_name'],
                'language' => $settings['template_language'],
                'variables' => [$otp, (string) $settings['otp_ttl_minutes']],
            ]),
        ]);

        if (is_wp_error($response)) {
            return $response;
        }

        $status = (int) wp_remote_retrieve_response_code($response);

        if ($status < 200 || $status >= 300) {
            return new WP_Error('sokany_whatsapp_send_failed', 'تعذر إرسال كود واتساب.', [
                'status' => 502,
                'response' => wp_remote_retrieve_body($response),
            ]);
        }

        return true;
    }
}

Sokany_WhatsApp_OTP::init();
