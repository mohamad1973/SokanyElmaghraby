<?php
/**
 * Plugin Name: SOKANY WhatsApp OTP
 * Description: WhatsApp OTP + customer order confirmation via MazBot for WooCommerce.
 * Version: 1.2.3
 * Author: SOKANY Egypt
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Sokany_WhatsApp_OTP {
    private const VERSION = '1.2.3';
    private const OPTION_KEY = 'sokany_whatsapp_otp_settings';
    private const LAST_TEST_OTP_OPTION = 'sokany_whatsapp_otp_last_test';
    private const LAST_ORDER_WA_OPTION = 'sokany_mazbot_last_order_wa';
    private const MAZBOT_JWT_TRANSIENT = 'sokany_mazbot_jwt_token';
    private const MAZBOT_API_BASE_TRANSIENT = 'sokany_mazbot_working_api_base';
    private const MAZBOT_LAST_ERROR_OPTION = 'sokany_mazbot_last_error';
    private const INSTALLED_VERSION_OPTION = 'sokany_whatsapp_otp_installed_version';
    private const ORDER_WA_META = '_sokany_order_wa_sent';
    private const ORDER_PRODUCTS_MAX_CHARS = 400;
    /** Static MazBot template URL button → company WhatsApp with prefilled «تأكيد الاوردر». */
    private const ORDER_CONFIRM_WA_URL = 'https://wa.me/201156111015?text=%D8%AA%D8%A3%D9%83%D9%8A%D8%AF%20%D8%A7%D9%84%D8%A7%D9%88%D8%B1%D8%AF%D8%B1';
    /** Absolute MazBot login URL — never built from API Base (avoids /login/login). */
    private const MAZBOT_LOGIN_URL = 'https://mazbot.net/api/login';
    private const TOKEN_TTL = 600;

    /** @var array<string, mixed>|null */
    private static $rest_customer_payload = null;

    public static function init(): void {
        register_activation_hook(__FILE__, [__CLASS__, 'activate']);
        add_action('admin_menu', [__CLASS__, 'register_admin_menu']);
        add_action('admin_init', [__CLASS__, 'register_settings']);
        add_action('admin_init', [__CLASS__, 'maybe_migrate_settings']);
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
        add_filter('rest_pre_dispatch', [__CLASS__, 'capture_rest_customer_phone'], 10, 3);
        add_filter('woocommerce_registration_errors', [__CLASS__, 'allow_rest_registration_phone'], 999, 3);
        add_action('woocommerce_created_customer', [__CLASS__, 'persist_phone_on_customer_create'], 20, 3);
        add_action('woocommerce_rest_insert_customer', [__CLASS__, 'persist_phone_on_rest_customer'], 10, 3);
        add_action('admin_post_sokany_mazbot_test_send', [__CLASS__, 'handle_mazbot_test_send']);
        add_action('admin_post_sokany_mazbot_test_login', [__CLASS__, 'handle_mazbot_test_login']);
        add_action('admin_post_sokany_mazbot_test_order', [__CLASS__, 'handle_mazbot_test_order']);
        add_action('update_option_' . self::OPTION_KEY, [__CLASS__, 'on_settings_updated'], 10, 0);
        // Classic checkout (items already attached).
        add_action('woocommerce_checkout_order_processed', [__CLASS__, 'on_woocommerce_order'], 20, 1);
        // Headless / REST create — fires after line_items are saved (unlike woocommerce_new_order).
        add_action('woocommerce_rest_insert_shop_order_object', [__CLASS__, 'on_woocommerce_rest_order'], 20, 3);
        // Fallback when order is completed on a later save (admin / delayed line items).
        add_action('woocommerce_update_order', [__CLASS__, 'on_woocommerce_order'], 20, 1);
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

        self::migrate_mazbot_api_base_option(true);
    }

    /**
     * Runs after file replace without deactivate/reactivate (common Hostinger upload).
     */
    public static function maybe_migrate_settings(): void {
        $installed = (string) get_option(self::INSTALLED_VERSION_OPTION, '');
        if ($installed === self::VERSION) {
            return;
        }

        self::migrate_mazbot_api_base_option(true);
        self::purge_stale_mazbot_last_error();
        update_option(self::INSTALLED_VERSION_OPTION, self::VERSION, false);
    }

    private static function migrate_mazbot_api_base_option(bool $clear_cache): void {
        $raw = get_option(self::OPTION_KEY, []);
        if (!is_array($raw)) {
            $raw = [];
        }

        $before = (string) ($raw['mazbot_api_base'] ?? '');
        $after = self::normalize_mazbot_api_base($before !== '' ? $before : 'https://mazbot.net/api');

        // Force canonical base if any /login remnant remains after normalize.
        if (preg_match('#/login#i', $after)) {
            $after = 'https://mazbot.net/api';
        }

        if ($before !== $after) {
            $raw['mazbot_api_base'] = $after;
            update_option(self::OPTION_KEY, $raw, false);
        }

        if ($clear_cache) {
            self::clear_mazbot_jwt();
            delete_transient(self::MAZBOT_API_BASE_TRANSIENT);
        }
    }

    private static function purge_stale_mazbot_last_error(): void {
        $last_error = (string) get_option(self::MAZBOT_LAST_ERROR_OPTION, '');
        if ($last_error === '') {
            return;
        }

        $marker = 'Plugin v' . self::VERSION;
        if (strpos($last_error, $marker) === false) {
            delete_option(self::MAZBOT_LAST_ERROR_OPTION);
        }
    }

    private static function table_name(): string {
        global $wpdb;

        return $wpdb->prefix . 'sokany_otp_codes';
    }

    public static function defaults(): array {
        return [
            'mode' => 'test',
            'provider' => 'mazbot',
            'otp_digits' => 6,
            'otp_ttl_minutes' => 5,
            'resend_wait_seconds' => 60,
            'mazbot_api_base' => 'https://mazbot.net/api',
            'mazbot_api_key' => '',
            'mazbot_email' => '',
            'mazbot_password' => '',
            'mazbot_template_id' => 0,
            'mazbot_include_button' => true,
            'order_wa_enabled' => false,
            'mazbot_order_template_id' => 0,
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

    public static function on_settings_updated(): void {
        self::clear_mazbot_jwt();
        delete_transient(self::MAZBOT_API_BASE_TRANSIENT);
    }

    private static function clean_secret(string $value): string {
        $value = str_replace(["\0", "\r", "\n"], '', $value);

        return trim($value);
    }

    public static function sanitize_settings($settings): array {
        $settings = is_array($settings) ? $settings : [];
        $defaults = self::defaults();
        $existing = self::settings();

        $mazbot_password = self::clean_secret((string) ($settings['mazbot_password'] ?? ''));
        if ($mazbot_password === '') {
            $mazbot_password = (string) ($existing['mazbot_password'] ?? '');
        }

        $mazbot_api_key = self::clean_secret((string) ($settings['mazbot_api_key'] ?? ''));
        if ($mazbot_api_key === '') {
            $mazbot_api_key = self::clean_secret((string) ($existing['mazbot_api_key'] ?? ''));
        }

        return [
            'mode' => in_array($settings['mode'] ?? '', ['test', 'live'], true) ? $settings['mode'] : $defaults['mode'],
            'provider' => in_array($settings['provider'] ?? '', ['mazbot', 'generic'], true) ? $settings['provider'] : $defaults['provider'],
            'otp_digits' => in_array((int) ($settings['otp_digits'] ?? 6), [4, 6], true) ? (int) $settings['otp_digits'] : 6,
            'otp_ttl_minutes' => max(1, min(30, (int) ($settings['otp_ttl_minutes'] ?? 5))),
            'resend_wait_seconds' => max(30, min(600, (int) ($settings['resend_wait_seconds'] ?? 60))),
            'mazbot_api_base' => self::normalize_mazbot_api_base((string) ($settings['mazbot_api_base'] ?? $defaults['mazbot_api_base'])),
            'mazbot_api_key' => $mazbot_api_key,
            'mazbot_email' => sanitize_email(self::clean_secret((string) ($settings['mazbot_email'] ?? ''))),
            'mazbot_password' => $mazbot_password,
            'mazbot_template_id' => max(0, (int) ($settings['mazbot_template_id'] ?? 0)),
            'mazbot_include_button' => !empty($settings['mazbot_include_button']),
            'order_wa_enabled' => !empty($settings['order_wa_enabled']),
            'mazbot_order_template_id' => max(0, (int) ($settings['mazbot_order_template_id'] ?? 0)),
            'api_base_url' => esc_url_raw((string) ($settings['api_base_url'] ?? '')),
            'api_token' => self::clean_secret((string) ($settings['api_token'] ?? '')),
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

        self::migrate_mazbot_api_base_option(false);
        self::purge_stale_mazbot_last_error();

        $settings = self::settings();
        $resolved_base = self::mazbot_configured_base();
        $resolved_login_url = self::MAZBOT_LOGIN_URL;
        $raw_base = (string) ($settings['mazbot_api_base'] ?? '');
        $base_looks_wrong = (bool) preg_match('#/login(/login)*$#i', rtrim($raw_base, '/'));
        $last_test = get_option(self::LAST_TEST_OTP_OPTION, []);
        $last_order_wa = get_option(self::LAST_ORDER_WA_OPTION, []);
        $last_error = get_option(self::MAZBOT_LAST_ERROR_OPTION, '');
        $test_notice = isset($_GET['mazbot_test']) ? sanitize_key((string) $_GET['mazbot_test']) : '';
        $login_notice = isset($_GET['mazbot_login']) ? sanitize_key((string) $_GET['mazbot_login']) : '';
        $order_notice = isset($_GET['mazbot_order']) ? sanitize_key((string) $_GET['mazbot_order']) : '';
        $api_key_len = strlen((string) ($settings['mazbot_api_key'] ?? ''));
        $password_len = strlen((string) ($settings['mazbot_password'] ?? ''));
        $api_key_tail = $api_key_len >= 4 ? substr((string) $settings['mazbot_api_key'], -4) : '';
        $plugin_file_mtime = @filemtime(__FILE__);
        $plugin_file_stamp = $plugin_file_mtime ? gmdate('Y-m-d H:i:s', $plugin_file_mtime) . ' UTC' : 'unknown';
        ?>
        <div class="wrap" dir="rtl">
            <h1>SOKANY WhatsApp OTP <span style="font-size:13px;font-weight:normal;color:#666;">v<?php echo esc_html(self::VERSION); ?></span></h1>
            <p style="color:#666;font-size:12px;">ملف البلجن على السيرفر: <code><?php echo esc_html(basename(__FILE__)); ?></code> — آخر تعديل: <code><?php echo esc_html($plugin_file_stamp); ?></code></p>
            <p>يدعم البلجن <strong>OTP</strong> وإشعار <strong>تأكيد الأوردر</strong> للعميل عبر MazBot.</p>
            <div class="notice notice-warning">
                <p><strong>قبل وصول الرسائل للموبايل:</strong> أصلح في MazBot/Meta أي خطأ <code>Business eligibility payment issue</code>. بدونه تظهر الرسائل في لوحة MazBot ولا تصل للهاتف.</p>
            </div>
            <div class="notice notice-info">
                <p><strong>قالب تأكيد الأوردر (MazBot):</strong> قالب مستقل عن OTP (UTILITY، عربي). النص والمتغيرات:</p>
                <pre style="direction:rtl;text-align:right;white-space:pre-wrap;background:#fff;padding:8px;border:1px solid #ccd0d4;">مرحباً {{1}} في سوكاني
تم عمل أوردر رقم {{2}} بالمنتجات التالية {{3}} بقيمة {{4}}
للتأكيد اضغط [زر: تأكيد الأوردر]
أو انتظار مكالمة من أحد ممثلي خدمة العملاء خلال 24 ساعة عمل
شكراً لثقتكم</pre>
                <p>
                    <code>{{1}}</code> = اسم العميل —
                    <code>{{2}}</code> = رقم الأوردر —
                    <code>{{3}}</code> = ملخص الأصناف (اسم ×كمية | سعر الوحدة | قيمة السطر) —
                    <code>{{4}}</code> = إجمالي الأوردر بالجنيه.
                </p>
                <p class="description">مثال {{3}}: <code>خلاط سوكاني ×2 | 500 ج.م | 1000 ج.م</code> — يُرسل بعد اكتمال بنود الطلب (REST/checkout) وليس عند إنشاء الطلب فارغاً.</p>
                <p><strong>زر URL في القالب</strong> بعنوان «تأكيد الأوردر» ورابط ثابت إلى واتساب الشركة <code>01156111015</code> برسالة «تأكيد الاوردر»:</p>
                <p dir="ltr" style="text-align:left;"><code><?php echo esc_html(self::ORDER_CONFIRM_WA_URL); ?></code></p>
            </div>
            <?php if ($base_looks_wrong) : ?>
                <div class="notice notice-error"><p><strong>تحذير:</strong> قيمة MazBot API Base تنتهي بـ <code>/login</code>. اكتب <code>https://mazbot.net/api</code> فقط ثم احفظ. رابط الدخول الثابت: <code><?php echo esc_html($resolved_login_url); ?></code></p></div>
            <?php endif; ?>

            <?php if ($login_notice === 'ok') : ?>
                <div class="notice notice-success is-dismissible"><p>نجح تسجيل الدخول إلى MazBot (تم الحصول على JWT).</p></div>
            <?php elseif ($login_notice === 'fail') : ?>
                <div class="notice notice-error is-dismissible"><p>فشل تسجيل الدخول إلى MazBot. راجع «آخر خطأ API» أدناه.</p></div>
            <?php endif; ?>

            <?php if ($test_notice === 'ok') : ?>
                <div class="notice notice-success is-dismissible"><p>تم إرسال رسالة الاختبار بنجاح عبر MazBot.</p></div>
            <?php elseif ($test_notice === 'fail') : ?>
                <div class="notice notice-error is-dismissible"><p>فشل إرسال الاختبار. راجع «آخر خطأ API» أدناه.</p></div>
            <?php endif; ?>

            <?php if ($order_notice === 'ok') : ?>
                <div class="notice notice-success is-dismissible"><p>تم إرسال اختبار قالب الأوردر عبر MazBot.</p></div>
            <?php elseif ($order_notice === 'fail') : ?>
                <div class="notice notice-error is-dismissible"><p>فشل اختبار قالب الأوردر. راجع «آخر خطأ API» أو «آخر إرسال أوردر» أدناه.</p></div>
            <?php elseif ($order_notice === 'test_mode') : ?>
                <div class="notice notice-info is-dismissible"><p>الوضع Test Mode: لم يُرسل واتساب. راجع «آخر إرسال أوردر» للمعاينة.</p></div>
            <?php endif; ?>

            <?php if (!empty($last_test['code'])) : ?>
                <div class="notice notice-info">
                    <p><strong>آخر كود اختبار (Test Mode):</strong> <?php echo esc_html($last_test['code']); ?> — رقم: <?php echo esc_html($last_test['phone'] ?? ''); ?> — الغرض: <?php echo esc_html($last_test['purpose'] ?? ''); ?></p>
                </div>
            <?php endif; ?>

            <?php if (!empty($last_order_wa) && is_array($last_order_wa)) : ?>
                <div class="notice notice-info">
                    <p><strong>آخر إرسال أوردر (واتساب):</strong></p>
                    <pre style="white-space:pre-wrap;direction:ltr;text-align:left;"><?php echo esc_html(wp_json_encode($last_order_wa, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)); ?></pre>
                </div>
            <?php endif; ?>

            <?php if ($last_error) : ?>
                <div class="notice notice-warning">
                    <p><strong>آخر خطأ MazBot API:</strong></p>
                    <pre style="white-space:pre-wrap;direction:ltr;text-align:left;"><?php echo esc_html($last_error); ?></pre>
                </div>
            <?php endif; ?>

            <div class="notice notice-info">
                <p><strong>حالة البيانات المحفوظة (بدون كشف الأسرار):</strong>
                    بريد: <code><?php echo esc_html((string) ($settings['mazbot_email'] ?: '—')); ?></code>
                    — API Key: <?php echo $api_key_len ? esc_html($api_key_len . ' حرف، آخر 4: …' . $api_key_tail) : 'غير محفوظ'; ?>
                    — كلمة المرور: <?php echo $password_len ? esc_html($password_len . ' حرف') : 'غير محفوظة'; ?>
                    — Template ID: <code><?php echo esc_html((string) ((int) $settings['mazbot_template_id'])); ?></code>
                </p>
            </div>
            <form method="post" action="options.php">
                <?php settings_fields('sokany_whatsapp_otp'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row">وضع الإرسال</th>
                        <td>
                            <select name="<?php echo esc_attr(self::OPTION_KEY); ?>[mode]">
                                <option value="test" <?php selected($settings['mode'], 'test'); ?>>Test Mode — الكود يظهر هنا فقط</option>
                                <option value="live" <?php selected($settings['mode'], 'live'); ?>>Live Mode — إرسال واتساب حقيقي</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">مزود الإرسال</th>
                        <td>
                            <select name="<?php echo esc_attr(self::OPTION_KEY); ?>[provider]">
                                <option value="mazbot" <?php selected($settings['provider'], 'mazbot'); ?>>MazBot (موصى به)</option>
                                <option value="generic" <?php selected($settings['provider'], 'generic'); ?>>Generic API (قديم)</option>
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
                </table>

                <h2>إعدادات MazBot</h2>
                <p class="description">من لوحة MazBot → API: انسخ <strong>API Key</strong>. أدخل بريد وكلمة مرور حساب MazBot (المالك أو عضو الفريق كما أكد الدعم). أنشئ قالب OTP معتمد واحفظ <strong>template_id</strong> الحقيقي من لوحة القوالب — لا تضع الرقم 1 إلا إذا كان هو ID القالب فعلاً. البلجن يجرّب تلقائياً مسارات <code>/api</code> و<code>/ar/api</code>.</p>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row">MazBot API Base</th>
                        <td>
                            <input type="url" class="regular-text" name="<?php echo esc_attr(self::OPTION_KEY); ?>[mazbot_api_base]" value="<?php echo esc_attr($resolved_base); ?>" placeholder="https://mazbot.net/api" />
                            <p class="description">اكتب بالضبط: <code>https://mazbot.net/api</code> — بدون <code>/login</code> في النهاية.</p>
                            <p class="description"><strong>Resolved login URL (ثابت):</strong> <code><?php echo esc_html($resolved_login_url); ?></code> — لا يُبنى من حقل Base حتى لا يحدث <code>.../login/login</code></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">MazBot API Key</th>
                        <td>
                            <input type="password" class="regular-text" name="<?php echo esc_attr(self::OPTION_KEY); ?>[mazbot_api_key]" value="" autocomplete="new-password" placeholder="<?php echo $api_key_len ? esc_attr('محفوظ — اترك فارغاً للإبقاء أو الصق مفتاحاً جديداً') : ''; ?>" />
                            <p class="description">الصق المفتاح بدون مسافات. إن تركته فارغاً يُبقى المفتاح المحفوظ.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">بريد حساب MazBot</th>
                        <td>
                            <input type="email" class="regular-text" name="<?php echo esc_attr(self::OPTION_KEY); ?>[mazbot_email]" value="<?php echo esc_attr($settings['mazbot_email']); ?>" />
                            <p class="description">بريد الحساب الرئيسي أو عضو الفريق — حسب ما أكده دعم MazBot.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">كلمة مرور حساب MazBot</th>
                        <td>
                            <input type="password" class="regular-text" name="<?php echo esc_attr(self::OPTION_KEY); ?>[mazbot_password]" value="" autocomplete="new-password" placeholder="<?php echo $password_len ? esc_attr('محفوظة (' . $password_len . ' حرف) — اترك فارغاً للإبقاء') : ''; ?>" />
                            <p class="description"><strong>مهم:</strong> عند تغيير الإعدادات يُفضّل إعادة كتابة كلمة المرور ثم الحفظ، ثم اضغط «اختبار الدخول» أولاً.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Template ID</th>
                        <td>
                            <input type="number" min="1" name="<?php echo esc_attr(self::OPTION_KEY); ?>[mazbot_template_id]" value="<?php echo esc_attr((string) $settings['mazbot_template_id']); ?>" />
                            <p class="description">رقم القالب من لوحة MazBot (Templates). إذا ظهر الإرسال فاشلاً بعد نجاح الدخول، غالباً Template ID غير صحيح.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">زر نسخ الكود في القالب</th>
                        <td>
                            <label>
                                <input type="checkbox" name="<?php echo esc_attr(self::OPTION_KEY); ?>[mazbot_include_button]" value="1" <?php checked(!empty($settings['mazbot_include_button'])); ?> />
                                أرسل OTP أيضاً في <code>button_values</code> (لقوالب Authentication بزر نسخ)
                            </label>
                        </td>
                    </tr>
                </table>

                <h2>إشعار واتساب للعميل عند الأوردر</h2>
                <p class="description">عند إنشاء طلب WooCommerce يُرسل قالب MazBot إلى <code>billing_phone</code>. يعمل مع Live Mode + MazBot. يتطلب قالب أوردر معتمد منفصل عن OTP وإصلاح أهلية الدفع في Meta.</p>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row">تفعيل إشعار الأوردر</th>
                        <td>
                            <label>
                                <input type="checkbox" name="<?php echo esc_attr(self::OPTION_KEY); ?>[order_wa_enabled]" value="1" <?php checked(!empty($settings['order_wa_enabled'])); ?> />
                                أرسل واتساب للعميل عند إنشاء الطلب
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Order Template ID</th>
                        <td>
                            <input type="number" min="1" name="<?php echo esc_attr(self::OPTION_KEY); ?>[mazbot_order_template_id]" value="<?php echo esc_attr((string) ((int) $settings['mazbot_order_template_id'])); ?>" />
                            <p class="description">Template ID من MazBot لقالب تأكيد الأوردر فقط — ليس قالب OTP (<code><?php echo esc_html((string) ((int) $settings['mazbot_template_id'])); ?></code>).</p>
                        </td>
                    </tr>
                </table>

                <h2>إعدادات Generic API (اختياري)</h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row">API Base URL</th>
                        <td><input type="url" class="regular-text" name="<?php echo esc_attr(self::OPTION_KEY); ?>[api_base_url]" value="<?php echo esc_attr($settings['api_base_url']); ?>" /></td>
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
                        <th scope="row">Sender ID</th>
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

            <h2>اختبار MazBot مباشرة</h2>
            <p class="description">احفظ الإعدادات أولاً، ثم اختبر الدخول قبل إرسال OTP.</p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-bottom:1.5rem;">
                <?php wp_nonce_field('sokany_mazbot_test_login'); ?>
                <input type="hidden" name="action" value="sokany_mazbot_test_login" />
                <?php submit_button('اختبار الدخول إلى MazBot فقط (بدون واتساب)', 'secondary', 'submit', false); ?>
            </form>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <?php wp_nonce_field('sokany_mazbot_test_send'); ?>
                <input type="hidden" name="action" value="sokany_mazbot_test_send" />
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row">رقم الاختبار</th>
                        <td>
                            <input type="text" name="test_phone" class="regular-text" placeholder="01000260262" required />
                            <p class="description">يُرسل OTP حقيقي عبر MazBot (يتجاوز Test Mode). Template ID مطلوب.</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button('إرسال OTP تجريبي عبر MazBot', 'secondary'); ?>
            </form>

            <h2>اختبار قالب الأوردر</h2>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <?php wp_nonce_field('sokany_mazbot_test_order'); ?>
                <input type="hidden" name="action" value="sokany_mazbot_test_order" />
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row">رقم الموبايل</th>
                        <td><input type="text" name="order_test_phone" class="regular-text" placeholder="01000260262" required /></td>
                    </tr>
                    <tr>
                        <th scope="row">اسم العميل</th>
                        <td><input type="text" name="order_test_name" class="regular-text" value="محمد" /></td>
                    </tr>
                    <tr>
                        <th scope="row">رقم طلب تجريبي</th>
                        <td><input type="text" name="order_test_number" class="regular-text" value="TEST-1001" /></td>
                    </tr>
                    <tr>
                        <th scope="row">المنتجات</th>
                        <td><input type="text" name="order_test_products" class="regular-text" value="خلاط سوكاني ×2 | 500 ج.م | 1000 ج.م" /></td>
                    </tr>
                    <tr>
                        <th scope="row">قيمة تجريبية</th>
                        <td><input type="text" name="order_test_total" class="regular-text" value="1500 ج.م" /></td>
                    </tr>
                </table>
                <?php submit_button('إرسال اختبار قالب الأوردر عبر MazBot', 'secondary'); ?>
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

    /**
     * Woo REST customer create sends phone in JSON, but some themes/plugins validate $_POST only
     * and add phone_error. Capture the payload early and mirror phone into $_POST.
     *
     * @param mixed            $result
     * @param WP_REST_Server   $server
     * @param WP_REST_Request  $request
     * @return mixed
     */
    public static function capture_rest_customer_phone($result, $server, $request) {
        if (!$request instanceof WP_REST_Request) {
            return $result;
        }

        $route = (string) $request->get_route();
        if (!preg_match('#/wc/v[23]/customers/?$#', $route) || strtoupper($request->get_method()) !== 'POST') {
            return $result;
        }

        $params = $request->get_json_params();
        if (!is_array($params) || !$params) {
            $params = $request->get_body_params();
        }
        if (!is_array($params)) {
            $params = [];
        }

        self::$rest_customer_payload = $params;
        $phone = self::extract_phone_from_payload($params);
        if ($phone) {
            self::seed_post_phone_fields($phone);
        }

        return $result;
    }

    /**
     * Remove false-positive phone_error when REST body already includes a valid phone.
     *
     * @param WP_Error $errors
     * @param string   $username
     * @param string   $email
     */
    public static function allow_rest_registration_phone($errors, $username = '', $email = '') {
        if (!$errors instanceof WP_Error) {
            return $errors;
        }

        $phone = self::resolve_registration_phone();
        if (!$phone) {
            return $errors;
        }

        self::seed_post_phone_fields($phone);

        foreach ($errors->get_error_codes() as $code) {
            if ($code === 'phone_error' || $code === 'billing_phone_error' || stripos((string) $code, 'phone') !== false) {
                $messages = $errors->get_error_messages($code);
                $should_remove = false;

                foreach ($messages as $message) {
                    $normalized = (string) $message;
                    if (
                        stripos($normalized, 'phone') !== false
                        || strpos($normalized, 'الهاتف') !== false
                        || strpos($normalized, 'الموبايل') !== false
                        || strpos($normalized, 'الجوال') !== false
                    ) {
                        $should_remove = true;
                        break;
                    }
                }

                if ($should_remove || $code === 'phone_error' || $code === 'billing_phone_error') {
                    $errors->remove($code);
                }
            }
        }

        return $errors;
    }

    /**
     * @param int                  $customer_id
     * @param array<string, mixed> $new_customer_data
     * @param bool                 $password_generated
     */
    public static function persist_phone_on_customer_create($customer_id, $new_customer_data = [], $password_generated = false): void {
        $customer_id = (int) $customer_id;
        if ($customer_id < 1) {
            return;
        }

        $phone = self::resolve_registration_phone();
        if (!$phone) {
            return;
        }

        self::persist_user_phone_meta($customer_id, $phone);
    }

    /**
     * @param WP_User         $user
     * @param WP_REST_Request $request
     * @param bool            $creating
     */
    public static function persist_phone_on_rest_customer($user, $request, $creating): void {
        if (!$creating || !($user instanceof WP_User)) {
            return;
        }

        $params = [];
        if ($request instanceof WP_REST_Request) {
            $json = $request->get_json_params();
            $params = is_array($json) && $json ? $json : $request->get_params();
        }
        if (!is_array($params) || !$params) {
            $params = is_array(self::$rest_customer_payload) ? self::$rest_customer_payload : [];
        }

        $phone = self::extract_phone_from_payload($params) ?: self::resolve_registration_phone();
        if (!$phone) {
            return;
        }

        self::persist_user_phone_meta((int) $user->ID, $phone);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private static function extract_phone_from_payload(array $payload): string {
        $candidates = [
            $payload['phone'] ?? null,
            $payload['billing']['phone'] ?? null,
            $payload['shipping']['phone'] ?? null,
        ];

        if (!empty($payload['meta_data']) && is_array($payload['meta_data'])) {
            foreach ($payload['meta_data'] as $meta) {
                if (!is_array($meta)) {
                    continue;
                }
                $key = (string) ($meta['key'] ?? '');
                if (in_array($key, ['billing_phone', 'phone', 'mobile'], true)) {
                    $candidates[] = $meta['value'] ?? null;
                }
            }
        }

        foreach ($candidates as $candidate) {
            if (!is_string($candidate) && !is_numeric($candidate)) {
                continue;
            }
            $normalized = self::normalize_phone((string) $candidate);
            if ($normalized) {
                return $normalized;
            }
        }

        return '';
    }

    private static function resolve_registration_phone(): string {
        if (is_array(self::$rest_customer_payload)) {
            $from_payload = self::extract_phone_from_payload(self::$rest_customer_payload);
            if ($from_payload) {
                return $from_payload;
            }
        }

        $post_candidates = [
            $_POST['billing_phone'] ?? '',
            $_POST['phone'] ?? '',
            $_REQUEST['billing_phone'] ?? '',
            $_REQUEST['phone'] ?? '',
        ];

        foreach ($post_candidates as $candidate) {
            $normalized = self::normalize_phone((string) $candidate);
            if ($normalized) {
                return $normalized;
            }
        }

        return '';
    }

    private static function to_local_egyptian_phone(string $normalized_phone): string {
        if (self::starts_with($normalized_phone, '20') && strlen($normalized_phone) === 12) {
            return '0' . substr($normalized_phone, 2);
        }

        return $normalized_phone;
    }

    private static function seed_post_phone_fields(string $normalized_phone): void {
        $local = self::to_local_egyptian_phone($normalized_phone);
        $_POST['billing_phone'] = $local;
        $_POST['phone'] = $local;
        $_REQUEST['billing_phone'] = $local;
        $_REQUEST['phone'] = $local;
    }

    private static function persist_user_phone_meta(int $user_id, string $normalized_phone): void {
        $local = self::to_local_egyptian_phone($normalized_phone);
        update_user_meta($user_id, 'billing_phone', $local);
        update_user_meta($user_id, 'phone', $local);
        update_user_meta($user_id, 'mobile', $local);
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

        if (($settings['provider'] ?? 'mazbot') === 'mazbot') {
            return self::send_whatsapp_via_mazbot($phone, $otp, $purpose);
        }

        return self::send_whatsapp_via_generic_api($phone, $otp, $purpose);
    }

    public static function handle_mazbot_test_login(): void {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }

        check_admin_referer('sokany_mazbot_test_login');

        $redirect = admin_url('options-general.php?page=sokany-whatsapp-otp');
        self::clear_mazbot_jwt();
        delete_transient(self::MAZBOT_API_BASE_TRANSIENT);

        $jwt = self::get_mazbot_jwt(true);

        if (is_wp_error($jwt)) {
            wp_safe_redirect(add_query_arg('mazbot_login', 'fail', $redirect));
            exit;
        }

        delete_option(self::MAZBOT_LAST_ERROR_OPTION);
        wp_safe_redirect(add_query_arg('mazbot_login', 'ok', $redirect));
        exit;
    }

    public static function handle_mazbot_test_send(): void {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }

        check_admin_referer('sokany_mazbot_test_send');

        $phone = self::normalize_phone((string) ($_POST['test_phone'] ?? ''));
        $redirect = admin_url('options-general.php?page=sokany-whatsapp-otp');

        if (!$phone) {
            update_option(self::MAZBOT_LAST_ERROR_OPTION, 'رقم الاختبار غير صالح.', false);
            wp_safe_redirect(add_query_arg('mazbot_test', 'fail', $redirect));
            exit;
        }

        $otp = self::generate_otp((int) self::settings()['otp_digits']);
        $result = self::send_whatsapp_via_mazbot($phone, $otp, 'test');

        if (is_wp_error($result)) {
            wp_safe_redirect(add_query_arg('mazbot_test', 'fail', $redirect));
            exit;
        }

        update_option(self::LAST_TEST_OTP_OPTION, [
            'phone' => $phone,
            'code' => $otp,
            'purpose' => 'mazbot_test',
            'createdAt' => current_time('mysql'),
        ], false);

        wp_safe_redirect(add_query_arg('mazbot_test', 'ok', $redirect));
        exit;
    }

    public static function handle_mazbot_test_order(): void {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }

        check_admin_referer('sokany_mazbot_test_order');

        $redirect = admin_url('options-general.php?page=sokany-whatsapp-otp');
        $phone = self::normalize_phone((string) ($_POST['order_test_phone'] ?? ''));
        $customer_name = sanitize_text_field((string) ($_POST['order_test_name'] ?? 'عميل'));
        $order_number = sanitize_text_field((string) ($_POST['order_test_number'] ?? 'TEST-1001'));
        $products = sanitize_text_field((string) ($_POST['order_test_products'] ?? 'منتج'));
        $order_total = sanitize_text_field((string) ($_POST['order_test_total'] ?? '1500 جنيه'));

        if (!$phone) {
            update_option(self::MAZBOT_LAST_ERROR_OPTION, 'رقم اختبار الأوردر غير صالح.', false);
            wp_safe_redirect(add_query_arg('mazbot_order', 'fail', $redirect));
            exit;
        }

        $result = self::send_order_whatsapp_message(
            $phone,
            $customer_name !== '' ? $customer_name : 'عميل',
            $order_number,
            $products !== '' ? $products : 'منتج',
            $order_total,
            [
                'source' => 'admin_test',
                'orderId' => 0,
            ]
        );

        if (is_wp_error($result)) {
            wp_safe_redirect(add_query_arg('mazbot_order', 'fail', $redirect));
            exit;
        }

        if ($result === 'test_mode') {
            wp_safe_redirect(add_query_arg('mazbot_order', 'test_mode', $redirect));
            exit;
        }

        wp_safe_redirect(add_query_arg('mazbot_order', 'ok', $redirect));
        exit;
    }

    /**
     * Classic checkout / order update (by id).
     *
     * @param int|string $order_id
     */
    public static function on_woocommerce_order($order_id): void {
        $order_id = (int) $order_id;
        if ($order_id < 1) {
            return;
        }

        self::maybe_send_order_whatsapp($order_id);
    }

    /**
     * REST API order insert (headless storefront). Prefer create only.
     *
     * @param mixed                $order    WC_Order
     * @param WP_REST_Request|null $request
     * @param bool                 $creating
     */
    public static function on_woocommerce_rest_order($order, $request = null, $creating = false): void {
        if (!$creating) {
            return;
        }

        $order_id = 0;
        if (is_object($order) && method_exists($order, 'get_id')) {
            $order_id = (int) $order->get_id();
        }

        if ($order_id < 1) {
            return;
        }

        self::maybe_send_order_whatsapp($order_id);
    }

    /**
     * @param mixed $order WC_Order
     */
    private static function order_has_billable_items($order): bool {
        if (!is_object($order) || !method_exists($order, 'get_items')) {
            return false;
        }

        foreach ($order->get_items() as $item) {
            if (!is_object($item) || !method_exists($item, 'get_name')) {
                continue;
            }
            $name = trim(wp_strip_all_tags((string) $item->get_name()));
            if ($name !== '') {
                return true;
            }
        }

        return false;
    }

    /**
     * Skip WhatsApp until line items exist and total is positive (avoids REST early empty order).
     *
     * @param mixed $order WC_Order
     */
    private static function order_ready_for_whatsapp($order): bool {
        if (!self::order_has_billable_items($order)) {
            return false;
        }

        if (!method_exists($order, 'get_total')) {
            return false;
        }

        return (float) $order->get_total() > 0;
    }

    private static function maybe_send_order_whatsapp(int $order_id): void {
        $settings = self::settings();

        if (empty($settings['order_wa_enabled'])) {
            return;
        }

        if (($settings['provider'] ?? 'mazbot') !== 'mazbot') {
            return;
        }

        if ((int) ($settings['mazbot_order_template_id'] ?? 0) < 1) {
            self::store_mazbot_error('إشعار الأوردر مفعّل لكن Order Template ID غير مضبوط.');
            return;
        }

        $sent_meta = get_post_meta($order_id, self::ORDER_WA_META, true);
        if ($sent_meta) {
            // Already sent or in-flight — do not resend.
            return;
        }

        if (!function_exists('wc_get_order')) {
            return;
        }

        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }

        // Wait for line items + total (REST often creates the order shell first).
        if (!self::order_ready_for_whatsapp($order)) {
            return;
        }

        $phone_raw = (string) $order->get_billing_phone();
        $phone = self::normalize_phone($phone_raw);
        if ($phone === '') {
            self::store_last_order_wa([
                'ok' => false,
                'orderId' => $order_id,
                'error' => 'billing_phone_invalid',
                'phoneRaw' => $phone_raw,
                'at' => current_time('mysql'),
            ]);
            return;
        }

        $order_number = (string) $order->get_order_number();
        $customer_name = self::order_customer_name($order);
        $products = self::order_products_summary($order);
        $total = self::order_total_label($order);

        // Mark early to prevent double send from concurrent hooks.
        update_post_meta($order_id, self::ORDER_WA_META, 'pending');

        $result = self::send_order_whatsapp_message($phone, $customer_name, $order_number, $products, $total, [
            'source' => 'woocommerce',
            'orderId' => $order_id,
        ]);

        if (is_wp_error($result)) {
            delete_post_meta($order_id, self::ORDER_WA_META);
            return;
        }

        update_post_meta($order_id, self::ORDER_WA_META, current_time('mysql'));
    }

    /**
     * @param mixed $order WC_Order
     */
    private static function order_customer_name($order): string {
        $first = trim((string) $order->get_billing_first_name());
        $last = trim((string) $order->get_billing_last_name());
        $name = trim($first . ' ' . $last);

        if ($name === '') {
            $name = trim((string) $order->get_billing_company());
        }

        return $name !== '' ? $name : 'عميل';
    }

    private static function format_money_egp(float $amount): string {
        $formatted = number_format(max(0, $amount), 2, '.', ',');
        if (substr($formatted, -3) === '.00') {
            $formatted = substr($formatted, 0, -3);
        }

        return $formatted . ' ج.م';
    }

    /**
     * @param mixed $order WC_Order
     */
    private static function order_total_label($order): string {
        $total = method_exists($order, 'get_total') ? (float) $order->get_total() : 0.0;

        return self::format_money_egp($total);
    }

    /**
     * @param mixed $order WC_Order
     */
    private static function order_products_summary($order): string {
        $lines = [];
        foreach ($order->get_items() as $item) {
            if (!is_object($item) || !method_exists($item, 'get_name')) {
                continue;
            }
            $name = trim(wp_strip_all_tags((string) $item->get_name()));
            if ($name === '') {
                continue;
            }
            $qty = method_exists($item, 'get_quantity') ? max(1, (int) $item->get_quantity()) : 1;
            $line_total = method_exists($item, 'get_total') ? (float) $item->get_total() : 0.0;
            $unit = $qty > 0 ? ($line_total / $qty) : $line_total;
            $lines[] = $name . ' ×' . $qty . ' | ' . self::format_money_egp($unit) . ' | ' . self::format_money_egp($line_total);
        }

        if (!$lines) {
            return '';
        }

        $summary = implode('، ', $lines);
        if (function_exists('mb_strlen') && function_exists('mb_substr')) {
            if (mb_strlen($summary) > self::ORDER_PRODUCTS_MAX_CHARS) {
                return mb_substr($summary, 0, self::ORDER_PRODUCTS_MAX_CHARS - 1) . '…';
            }

            return $summary;
        }

        if (strlen($summary) > self::ORDER_PRODUCTS_MAX_CHARS) {
            return substr($summary, 0, self::ORDER_PRODUCTS_MAX_CHARS - 3) . '...';
        }

        return $summary;
    }

    /**
     * @param array{source?:string,orderId?:int} $context
     * @return true|string|WP_Error true on send, "test_mode" when previewed only
     */
    private static function send_order_whatsapp_message(
        string $phone,
        string $customer_name,
        string $order_number,
        string $products,
        string $order_total,
        array $context = []
    ) {
        $settings = self::settings();
        $template_id = (int) ($settings['mazbot_order_template_id'] ?? 0);

        if ($template_id < 1) {
            $error = new WP_Error('sokany_order_template_missing', 'Order Template ID غير مضبوط.', ['status' => 500]);
            self::store_mazbot_error($error->get_error_message());
            self::store_last_order_wa([
                'ok' => false,
                'error' => $error->get_error_message(),
                'phone' => $phone,
                'customerName' => $customer_name,
                'orderNumber' => $order_number,
                'products' => $products,
                'orderTotal' => $order_total,
                'context' => $context,
                'at' => current_time('mysql'),
            ]);

            return $error;
        }

        $body_values = [
            '1' => $customer_name,
            '2' => $order_number,
            '3' => $products,
            '4' => $order_total,
        ];

        if (($settings['mode'] ?? 'test') === 'test') {
            self::store_last_order_wa([
                'ok' => true,
                'testMode' => true,
                'phone' => $phone,
                'customerName' => $customer_name,
                'orderNumber' => $order_number,
                'products' => $products,
                'orderTotal' => $order_total,
                'templateId' => $template_id,
                'bodyValues' => $body_values,
                'confirmButtonUrl' => self::ORDER_CONFIRM_WA_URL,
                'context' => $context,
                'at' => current_time('mysql'),
            ]);

            return 'test_mode';
        }

        $sent = self::send_mazbot_template($phone, $template_id, $body_values, false);

        if (is_wp_error($sent)) {
            self::store_last_order_wa([
                'ok' => false,
                'error' => $sent->get_error_message(),
                'phone' => $phone,
                'customerName' => $customer_name,
                'orderNumber' => $order_number,
                'products' => $products,
                'orderTotal' => $order_total,
                'templateId' => $template_id,
                'context' => $context,
                'at' => current_time('mysql'),
            ]);

            return $sent;
        }

        self::store_last_order_wa([
            'ok' => true,
            'testMode' => false,
            'phone' => $phone,
            'customerName' => $customer_name,
            'orderNumber' => $order_number,
            'products' => $products,
            'orderTotal' => $order_total,
            'templateId' => $template_id,
            'bodyValues' => $body_values,
            'confirmButtonUrl' => self::ORDER_CONFIRM_WA_URL,
            'context' => $context,
            'at' => current_time('mysql'),
        ]);

        return true;
    }

    private static function store_last_order_wa(array $payload): void {
        update_option(self::LAST_ORDER_WA_OPTION, $payload, false);
    }

    private static function normalize_mazbot_api_base(string $base): string {
        $base = self::clean_secret($base);
        $base = esc_url_raw($base);

        if ($base === '') {
            return 'https://mazbot.net/api';
        }

        $base = rtrim($base, '/');

        // Strip repeated paste mistakes: .../api/login, .../login/login, .../whatsapp/send-template
        $guard = 0;
        while ($guard < 8 && preg_match('#/(login|whatsapp/send-template)$#i', $base)) {
            $base = (string) preg_replace('#/(login|whatsapp/send-template)$#i', '', $base);
            $base = rtrim($base, '/');
            $guard++;
        }

        // https://mazbot.net → https://mazbot.net/api
        if (preg_match('#^https?://[^/]+$#i', $base)) {
            $base .= '/api';
        }

        // https://mazbot.net/ar → https://mazbot.net/ar/api
        if (preg_match('#^https?://[^/]+/[a-z]{2}$#i', $base)) {
            $base .= '/api';
        }

        return rtrim($base, '/');
    }

    private static function mazbot_configured_base(): string {
        $settings = self::settings();

        return self::normalize_mazbot_api_base((string) ($settings['mazbot_api_base'] ?: 'https://mazbot.net/api'));
    }

    /**
     * Build candidate API base URLs: configured /api, then /ar/api and /en/api variants.
     *
     * @return list<string>
     */
    private static function mazbot_api_base_candidates(): array {
        $configured = self::mazbot_configured_base();
        $candidates = [$configured];

        if (preg_match('#^(https?://[^/]+)(?:/.*)?/api$#i', $configured, $matches)) {
            $origin = $matches[1];
            $candidates[] = $origin . '/api';
            $candidates[] = $origin . '/ar/api';
            $candidates[] = $origin . '/en/api';
        }

        $working = get_transient(self::MAZBOT_API_BASE_TRANSIENT);
        if (is_string($working) && $working !== '') {
            $normalized_working = self::normalize_mazbot_api_base($working);
            // Never prefer a broken cached base that still contains /login.
            if (!preg_match('#/login$#i', $normalized_working)) {
                array_unshift($candidates, $normalized_working);
            } else {
                delete_transient(self::MAZBOT_API_BASE_TRANSIENT);
            }
        }

        return array_values(array_unique(array_filter($candidates)));
    }

    private static function mazbot_api_url(string $path, ?string $base = null): string {
        $base = rtrim($base ?: self::mazbot_configured_base(), '/');
        $path = '/' . ltrim($path, '/');

        // If base already ends with the same path segment (e.g. /login), do not double it.
        if ($path !== '/' && preg_match('#/' . preg_quote(ltrim($path, '/'), '#') . '$#i', $base)) {
            return $base;
        }

        return $base . $path;
    }

    private static function clear_mazbot_jwt(): void {
        delete_transient(self::MAZBOT_JWT_TRANSIENT);
    }

    private static function store_mazbot_error(string $message): void {
        update_option(self::MAZBOT_LAST_ERROR_OPTION, $message, false);
    }

    private static function mazbot_message_from_body($json, string $body): string {
        if (is_array($json)) {
            if (!empty($json['message']) && is_string($json['message'])) {
                return $json['message'];
            }

            if (!empty($json['error']) && is_string($json['error'])) {
                return $json['error'];
            }

            if (!empty($json['errors']) && is_array($json['errors'])) {
                $parts = [];
                foreach ($json['errors'] as $key => $value) {
                    if (is_array($value)) {
                        $parts[] = $key . ': ' . implode(', ', array_map('strval', $value));
                    } else {
                        $parts[] = $key . ': ' . (string) $value;
                    }
                }

                if ($parts) {
                    return implode(' | ', $parts);
                }
            }
        }

        $trimmed = trim($body);

        return $trimmed !== '' ? $trimmed : 'empty_response';
    }

    private static function mazbot_user_login_error(int $status, string $api_message): WP_Error {
        $hint = 'تحقق من API Key والبريد وكلمة المرور. إن استمر الفشل انسخ «آخر خطأ MazBot API» من صفحة الإعدادات.';

        if ($status === 401 || $status === 403) {
            $hint = 'تحقق من API Key وكلمة المرور. إن كان لوحة MazBot بالعربية قد يلزم مسار /ar/api (البلجن يجرّبه تلقائياً).';
        }

        return new WP_Error(
            'sokany_mazbot_login_failed',
            'تعذر تسجيل الدخول إلى MazBot (' . $status . '): ' . $api_message . ' — ' . $hint,
            ['status' => 502]
        );
    }

    /**
     * @return array{0:int,1:string,2:array<string,mixed>|null}|WP_Error
     */
    private static function mazbot_http_post(string $url, array $headers, array $payload) {
        $response = wp_remote_post($url, [
            'timeout' => 20,
            'headers' => $headers,
            'body' => wp_json_encode($payload),
        ]);

        if (is_wp_error($response)) {
            self::store_mazbot_error($response->get_error_message());
            return $response;
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $body = (string) wp_remote_retrieve_body($response);
        $json = json_decode($body, true);

        return [$status, $body, is_array($json) ? $json : null];
    }

    /**
     * Absolute MazBot login URLs only — never append /login to API Base.
     *
     * @return list<string>
     */
    private static function mazbot_login_urls(): array {
        return [
            self::MAZBOT_LOGIN_URL,
            'https://mazbot.net/ar/api/login',
            'https://mazbot.net/en/api/login',
        ];
    }

    private static function get_mazbot_jwt(bool $force_refresh = false) {
        if (!$force_refresh) {
            $cached = get_transient(self::MAZBOT_JWT_TRANSIENT);
            if (is_string($cached) && $cached !== '') {
                return $cached;
            }
        }

        $settings = self::settings();

        if (empty($settings['mazbot_api_key']) || empty($settings['mazbot_email']) || empty($settings['mazbot_password'])) {
            return new WP_Error('sokany_mazbot_not_configured', 'إعدادات MazBot غير مكتملة (API Key / البريد / كلمة المرور).', ['status' => 500]);
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
        $attempts = [];

        foreach (self::mazbot_login_urls() as $url) {
            $result = self::mazbot_http_post($url, $headers, $payload);

            if (is_wp_error($result)) {
                $last_message = $result->get_error_message();
                $attempts[] = $url . ' => network_error';
                continue;
            }

            [$status, $body, $json] = $result;
            $api_message = self::mazbot_message_from_body($json, $body);
            $attempts[] = $url . ' => HTTP ' . $status . ' / ' . $api_message;
            $token = is_array($json) ? (string) ($json['data']['token'] ?? '') : '';
            $success_flag = is_array($json) ? ($json['success'] ?? null) : null;

            if ($status >= 200 && $status < 300 && $token !== '' && $success_flag !== false) {
                set_transient(self::MAZBOT_JWT_TRANSIENT, $token, 50 * MINUTE_IN_SECONDS);
                $base_from_login = self::normalize_mazbot_api_base(preg_replace('#/login$#i', '', $url) ?: 'https://mazbot.net/api');
                set_transient(self::MAZBOT_API_BASE_TRANSIENT, $base_from_login, DAY_IN_SECONDS);
                delete_option(self::MAZBOT_LAST_ERROR_OPTION);

                return $token;
            }

            $last_status = $status;
            $last_message = $api_message;

            // Try next locale path on 404 only; keep last auth error for 401/403.
            if ($status !== 404) {
                break;
            }
        }

        $settings = self::settings();
        $diag = sprintf(
            "Saved credentials check: email=%s | api_key_len=%d | password_len=%d | template_id=%d | file=%s",
            (string) ($settings['mazbot_email'] ?? ''),
            strlen((string) ($settings['mazbot_api_key'] ?? '')),
            strlen((string) ($settings['mazbot_password'] ?? '')),
            (int) ($settings['mazbot_template_id'] ?? 0),
            basename(__FILE__)
        );

        self::store_mazbot_error(
            "Plugin v" . self::VERSION . "\nMazBot login failed (HTTP {$last_status}): {$last_message}\n{$diag}\nTried:\n" . implode("\n", $attempts)
        );

        return self::mazbot_user_login_error($last_status ?: 502, $last_message ?: 'unknown_error');
    }

    private static function send_whatsapp_via_mazbot(string $phone, string $otp, string $purpose, bool $retry = true) {
        $settings = self::settings();
        $template_id = (int) $settings['mazbot_template_id'];

        if (empty($settings['mazbot_api_key']) || $template_id < 1) {
            return new WP_Error('sokany_mazbot_not_configured', 'إعدادات MazBot غير مكتملة (API Key / Template ID).', ['status' => 500]);
        }

        $body_values = ['1' => $otp];
        $include_button = !empty($settings['mazbot_include_button']);

        return self::send_mazbot_template($phone, $template_id, $body_values, $include_button, $retry);
    }

    /**
     * @param array<string,string> $body_values keys "1","2",...
     */
    private static function send_mazbot_template(
        string $phone,
        int $template_id,
        array $body_values,
        bool $include_button = false,
        bool $retry = true
    ) {
        $settings = self::settings();

        if (empty($settings['mazbot_api_key']) || $template_id < 1) {
            return new WP_Error('sokany_mazbot_not_configured', 'إعدادات MazBot غير مكتملة (API Key / Template ID).', ['status' => 500]);
        }

        $jwt = self::get_mazbot_jwt();

        if (is_wp_error($jwt)) {
            return $jwt;
        }

        $normalized_values = [];
        $body_matchs = [];
        foreach ($body_values as $key => $value) {
            $index = (string) $key;
            $normalized_values[$index] = (string) $value;
            $body_matchs[$index] = 'input_value';
        }

        $payload = [
            'template_id' => $template_id,
            'mobile' => $phone,
            'body_matchs' => $body_matchs,
            'body_values' => $normalized_values,
        ];

        if ($include_button && isset($normalized_values['1'])) {
            $payload['button_matchs'] = ['1' => 'input_value'];
            $payload['button_values'] = ['1' => $normalized_values['1']];
        }

        $response = self::mazbot_post_template($jwt, $payload);

        if (is_wp_error($response)) {
            return $response;
        }

        [$status, $body, $json] = $response;

        if ($status === 401 && $retry) {
            self::clear_mazbot_jwt();
            $jwt = self::get_mazbot_jwt(true);

            if (is_wp_error($jwt)) {
                return $jwt;
            }

            $response = self::mazbot_post_template($jwt, $payload);

            if (is_wp_error($response)) {
                return $response;
            }

            [$status, $body, $json] = $response;
        }

        if ($status === 404) {
            delete_transient(self::MAZBOT_API_BASE_TRANSIENT);
            $response = self::mazbot_post_template($jwt, $payload, true);

            if (!is_wp_error($response)) {
                [$status, $body, $json] = $response;
            }
        }

        $success = is_array($json) ? ($json['success'] ?? null) : null;
        $api_message = self::mazbot_message_from_body($json, $body);

        if ($status < 200 || $status >= 300 || $success !== true) {
            self::store_mazbot_error(
                'Plugin v' . self::VERSION . "\nMazBot send-template failed ({$status}): {$api_message}"
            );

            return new WP_Error(
                'sokany_mazbot_send_failed',
                'تعذر إرسال واتساب عبر MazBot (' . $status . '): ' . $api_message,
                [
                    'status' => 502,
                    'response' => $body,
                ]
            );
        }

        delete_option(self::MAZBOT_LAST_ERROR_OPTION);

        return true;
    }

    /**
     * @return array{0:int,1:string,2:array<string,mixed>|null}|WP_Error
     */
    private static function mazbot_post_template(string $jwt, array $payload, bool $try_all_bases = false) {
        $settings = self::settings();
        $headers = [
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
            'apikey' => (string) $settings['mazbot_api_key'],
            'Authorization' => 'Bearer ' . $jwt,
        ];

        $bases = $try_all_bases ? self::mazbot_api_base_candidates() : [self::mazbot_configured_base()];
        $working = get_transient(self::MAZBOT_API_BASE_TRANSIENT);
        if (!$try_all_bases && is_string($working) && $working !== '') {
            $bases = [rtrim($working, '/')];
        }

        $last = null;

        foreach ($bases as $base) {
            $result = self::mazbot_http_post(self::mazbot_api_url('/whatsapp/send-template', $base), $headers, $payload);

            if (is_wp_error($result)) {
                $last = $result;
                continue;
            }

            [$status] = $result;

            if ($status !== 404) {
                if ($status >= 200 && $status < 300) {
                    set_transient(self::MAZBOT_API_BASE_TRANSIENT, $base, DAY_IN_SECONDS);
                }

                return $result;
            }

            $last = $result;
        }

        return $last instanceof WP_Error
            ? $last
            : ($last ?: new WP_Error('sokany_mazbot_send_failed', 'تعذر الوصول لمسار send-template.', ['status' => 502]));
    }

    private static function send_whatsapp_via_generic_api(string $phone, string $otp, string $purpose) {
        $settings = self::settings();

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
