<?php
/**
 * Unified WooCommerce order WhatsApp queue (Classic / Blocks / REST).
 *
 * Loaded by Sokany_WhatsApp_OTP.
 */

if (!defined('ABSPATH')) {
    exit;
}

trait Sokany_WhatsApp_OTP_Order_Trait {
    private const ORDER_WA_STATE_META = '_sokany_order_wa_state';
    private const ORDER_WA_ATTEMPTS_META = '_sokany_order_wa_attempts';
    private const ORDER_WA_LEASE_META = '_sokany_order_wa_lease';
    private const ORDER_WA_LAST_ERROR_META = '_sokany_order_wa_last_error';
    private const ORDER_WA_SOURCE_META = '_sokany_order_wa_source';
    private const ORDER_WA_HISTORY_OPTION = 'sokany_mazbot_order_wa_history';
    private const AS_HOOK = 'sokany_whatsapp_otp_process_order';
    private const SENDING_LEASE_SECONDS = 120;
    private const MAX_SEND_ATTEMPTS = 5;

    public static function register_order_hooks(): void {
        add_action('woocommerce_checkout_order_processed', [__CLASS__, 'on_classic_checkout_order'], 20, 1);
        add_action('woocommerce_store_api_checkout_order_processed', [__CLASS__, 'on_blocks_checkout_order'], 20, 1);
        add_action('woocommerce_rest_insert_shop_order_object', [__CLASS__, 'on_woocommerce_rest_order'], 20, 3);
        add_action('woocommerce_new_order', [__CLASS__, 'on_new_order_safety_net'], 30, 1);
        add_action('woocommerce_update_order', [__CLASS__, 'on_order_update_fallback'], 20, 1);
        add_action(self::AS_HOOK, [__CLASS__, 'process_order_whatsapp_job'], 10, 2);
        add_action('admin_post_sokany_resend_order_wa', [__CLASS__, 'handle_resend_order_wa']);
    }

    public static function on_classic_checkout_order($order_id): void {
        self::queue_order_whatsapp((int) $order_id, 'classic');
    }

    /**
     * @param mixed $order WC_Order
     */
    public static function on_blocks_checkout_order($order): void {
        $order_id = 0;
        if (is_object($order) && method_exists($order, 'get_id')) {
            $order_id = (int) $order->get_id();
        } elseif (is_numeric($order)) {
            $order_id = (int) $order;
        }

        self::queue_order_whatsapp($order_id, 'blocks');
    }

    /**
     * @param mixed                $order
     * @param WP_REST_Request|null $request
     */
    public static function on_woocommerce_rest_order($order, $request = null, $creating = false): void {
        if (!$creating) {
            return;
        }

        $order_id = 0;
        if (is_object($order) && method_exists($order, 'get_id')) {
            $order_id = (int) $order->get_id();
        }

        self::queue_order_whatsapp($order_id, 'rest');
    }

    public static function on_new_order_safety_net($order_id): void {
        self::queue_order_whatsapp((int) $order_id, 'new_order', 15);
    }

    public static function on_order_update_fallback($order_id): void {
        $order_id = (int) $order_id;
        if ($order_id < 1 || !function_exists('wc_get_order')) {
            return;
        }

        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }

        $state = (string) $order->get_meta(self::ORDER_WA_STATE_META, true);
        if (in_array($state, ['sent', 'queued', 'sending'], true)) {
            return;
        }

        if ($state === 'failed') {
            return;
        }

        // Legacy flag from v1.2.x
        $legacy = (string) $order->get_meta(self::ORDER_WA_META, true);
        if ($legacy !== '' && $legacy !== 'pending') {
            return;
        }

        if (!self::order_ready_for_whatsapp($order)) {
            return;
        }

        self::queue_order_whatsapp($order_id, 'update');
    }

    /**
     * Back-compat entry used by older call sites.
     */
    public static function on_woocommerce_order($order_id): void {
        self::queue_order_whatsapp((int) $order_id, 'legacy');
    }

    public static function queue_order_whatsapp(int $order_id, string $source, int $delay_seconds = 3): void {
        if ($order_id < 1) {
            return;
        }

        $settings = self::settings();
        if (empty($settings['order_wa_enabled'])) {
            self::log_order('info', 'skip_disabled', ['orderId' => $order_id, 'source' => $source]);
            return;
        }

        if (($settings['provider'] ?? 'mazbot') !== 'mazbot') {
            self::log_order('warning', 'skip_provider', ['orderId' => $order_id, 'source' => $source]);
            return;
        }

        if ((int) ($settings['mazbot_order_template_id'] ?? 0) < 1) {
            self::store_mazbot_error('إشعار الأوردر مفعّل لكن Order Template ID غير مضبوط.');
            self::log_order('error', 'skip_missing_template', ['orderId' => $order_id, 'source' => $source]);
            return;
        }

        if (!function_exists('wc_get_order')) {
            return;
        }

        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }

        if (self::order_is_cancelled($order)) {
            self::log_order('info', 'skip_cancelled', ['orderId' => $order_id, 'source' => $source]);
            return;
        }

        $state = (string) $order->get_meta(self::ORDER_WA_STATE_META, true);
        $legacy = (string) $order->get_meta(self::ORDER_WA_META, true);

        if ($state === 'sent' || ($legacy !== '' && $legacy !== 'pending' && $state === '')) {
            self::log_order('info', 'skip_already_sent', ['orderId' => $order_id, 'source' => $source, 'state' => $state ?: $legacy]);
            return;
        }

        if ($state === 'sending') {
            $lease = (int) $order->get_meta(self::ORDER_WA_LEASE_META, true);
            if ($lease > time()) {
                self::log_order('info', 'skip_in_flight', ['orderId' => $order_id, 'source' => $source]);
                return;
            }
        }

        if ($state === 'queued' && self::has_pending_as_job($order_id)) {
            self::log_order('info', 'skip_already_queued', ['orderId' => $order_id, 'source' => $source]);
            return;
        }

        $order->update_meta_data(self::ORDER_WA_STATE_META, 'queued');
        $order->update_meta_data(self::ORDER_WA_SOURCE_META, $source);
        $order->save_meta_data();

        $scheduled = self::schedule_order_job($order_id, $source, max(0, $delay_seconds));
        self::log_order('info', $scheduled ? 'queued' : 'queue_failed_fallback_sync', [
            'orderId' => $order_id,
            'source' => $source,
            'delay' => $delay_seconds,
        ]);

        if (!$scheduled) {
            self::process_order_whatsapp_job($order_id, $source);
        }
    }

    private static function schedule_order_job(int $order_id, string $source, int $delay_seconds): bool {
        $args = [$order_id, $source];

        if (function_exists('as_has_scheduled_action') && as_has_scheduled_action(self::AS_HOOK, $args, 'sokany-whatsapp-otp')) {
            return true;
        }

        if (function_exists('as_schedule_single_action')) {
            as_schedule_single_action(time() + $delay_seconds, self::AS_HOOK, $args, 'sokany-whatsapp-otp');
            return true;
        }

        // Fallback when Action Scheduler is unavailable.
        if (!wp_next_scheduled(self::AS_HOOK, $args)) {
            wp_schedule_single_event(time() + $delay_seconds, self::AS_HOOK, $args);
        }

        return (bool) wp_next_scheduled(self::AS_HOOK, $args);
    }

    private static function has_pending_as_job(int $order_id): bool {
        if (!function_exists('as_has_scheduled_action')) {
            return false;
        }

        foreach (['classic', 'blocks', 'rest', 'new_order', 'update', 'legacy', 'resend', ''] as $source) {
            if (as_has_scheduled_action(self::AS_HOOK, [$order_id, $source], 'sokany-whatsapp-otp')) {
                return true;
            }
        }

        return false;
    }

    public static function process_order_whatsapp_job($order_id, $source = 'worker'): void {
        $order_id = (int) $order_id;
        $source = is_string($source) && $source !== '' ? $source : 'worker';

        if ($order_id < 1 || !function_exists('wc_get_order')) {
            return;
        }

        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }

        if (self::order_is_cancelled($order)) {
            self::log_order('info', 'worker_skip_cancelled', ['orderId' => $order_id, 'source' => $source]);
            return;
        }

        $state = (string) $order->get_meta(self::ORDER_WA_STATE_META, true);
        $legacy = (string) $order->get_meta(self::ORDER_WA_META, true);
        if ($state === 'sent' || ($legacy !== '' && $legacy !== 'pending' && $state === '')) {
            return;
        }

        if ($state === 'sending') {
            $lease = (int) $order->get_meta(self::ORDER_WA_LEASE_META, true);
            if ($lease > time()) {
                return;
            }
        }

        if (!self::order_ready_for_whatsapp($order)) {
            $attempts = (int) $order->get_meta(self::ORDER_WA_ATTEMPTS_META, true);
            if ($attempts < 3) {
                $order->update_meta_data(self::ORDER_WA_ATTEMPTS_META, $attempts + 1);
                $order->update_meta_data(self::ORDER_WA_STATE_META, 'queued');
                $order->save_meta_data();
                self::schedule_order_job($order_id, $source, 20);
                self::log_order('info', 'worker_not_ready_requeue', ['orderId' => $order_id, 'source' => $source, 'attempt' => $attempts + 1]);
            } else {
                self::mark_order_failed($order, 'order_not_ready', $source);
            }
            return;
        }

        $phone = self::resolve_order_phone($order);
        if ($phone === '') {
            self::mark_order_failed($order, 'phone_invalid', $source);
            self::store_last_order_wa([
                'ok' => false,
                'orderId' => $order_id,
                'error' => 'phone_invalid',
                'source' => $source,
                'at' => current_time('mysql'),
            ]);
            return;
        }

        $attempts = (int) $order->get_meta(self::ORDER_WA_ATTEMPTS_META, true) + 1;
        $order->update_meta_data(self::ORDER_WA_ATTEMPTS_META, $attempts);
        $order->update_meta_data(self::ORDER_WA_STATE_META, 'sending');
        $order->update_meta_data(self::ORDER_WA_LEASE_META, time() + self::SENDING_LEASE_SECONDS);
        $order->update_meta_data(self::ORDER_WA_SOURCE_META, $source);
        $order->save_meta_data();

        $settings = self::settings();
        $customer_name = self::order_customer_name($order);
        $order_number = (string) $order->get_order_number();
        $products = self::order_products_summary($order);
        $total = self::order_total_label($order);

        $result = self::send_order_whatsapp_message($phone, $customer_name, $order_number, $products, $total, [
            'source' => $source,
            'orderId' => $order_id,
        ]);

        if ($result === 'test_mode') {
            // Preview only — do not mark as sent so Live mode can still deliver later.
            $order->update_meta_data(self::ORDER_WA_STATE_META, 'queued');
            $order->delete_meta_data(self::ORDER_WA_LEASE_META);
            $order->save_meta_data();
            self::log_order('info', 'test_mode_preview', ['orderId' => $order_id, 'source' => $source]);
            if (method_exists($order, 'add_order_note')) {
                $order->add_order_note('SOKANY WhatsApp: Test Mode preview only (not marked sent).');
            }
            return;
        }

        if (is_wp_error($result)) {
            $error = $result->get_error_message();
            $retryable = self::is_retryable_order_error($result);

            if ($retryable && $attempts < self::MAX_SEND_ATTEMPTS) {
                $delay = min(900, 30 * (2 ** max(0, $attempts - 1)));
                $order->update_meta_data(self::ORDER_WA_STATE_META, 'queued');
                $order->update_meta_data(self::ORDER_WA_LAST_ERROR_META, $error);
                $order->delete_meta_data(self::ORDER_WA_LEASE_META);
                $order->save_meta_data();
                self::schedule_order_job($order_id, $source, $delay);
                self::log_order('warning', 'retry_scheduled', [
                    'orderId' => $order_id,
                    'source' => $source,
                    'attempt' => $attempts,
                    'delay' => $delay,
                    'error' => $error,
                ]);
                return;
            }

            self::mark_order_failed($order, $error, $source);
            return;
        }

        $sent_at = current_time('mysql');
        $order->update_meta_data(self::ORDER_WA_STATE_META, 'sent');
        $order->update_meta_data(self::ORDER_WA_META, $sent_at);
        $order->delete_meta_data(self::ORDER_WA_LEASE_META);
        $order->delete_meta_data(self::ORDER_WA_LAST_ERROR_META);
        $order->save_meta_data();

        if (method_exists($order, 'add_order_note')) {
            $order->add_order_note('SOKANY WhatsApp: order confirmation sent (' . $source . ').');
        }

        self::push_order_history([
            'ok' => true,
            'orderId' => $order_id,
            'orderNumber' => $order_number,
            'phone' => $phone,
            'source' => $source,
            'at' => $sent_at,
        ]);

        self::log_order('info', 'sent', [
            'orderId' => $order_id,
            'source' => $source,
            'attempt' => $attempts,
        ]);
    }

    /**
     * @param mixed $order WC_Order
     */
    private static function mark_order_failed($order, string $error, string $source): void {
        $order->update_meta_data(self::ORDER_WA_STATE_META, 'failed');
        $order->update_meta_data(self::ORDER_WA_LAST_ERROR_META, $error);
        $order->delete_meta_data(self::ORDER_WA_LEASE_META);
        $order->save_meta_data();

        if (method_exists($order, 'add_order_note')) {
            $order->add_order_note('SOKANY WhatsApp: failed — ' . $error);
        }

        self::store_last_order_wa([
            'ok' => false,
            'orderId' => (int) $order->get_id(),
            'error' => $error,
            'source' => $source,
            'at' => current_time('mysql'),
        ]);

        self::push_order_history([
            'ok' => false,
            'orderId' => (int) $order->get_id(),
            'error' => $error,
            'source' => $source,
            'at' => current_time('mysql'),
        ]);

        self::log_order('error', 'failed', [
            'orderId' => (int) $order->get_id(),
            'source' => $source,
            'error' => $error,
        ]);
    }

    private static function is_retryable_order_error(WP_Error $error): bool {
        $code = $error->get_error_code();
        $message = strtolower($error->get_error_message());
        $data = $error->get_error_data();
        $status = is_array($data) ? (int) ($data['status'] ?? 0) : 0;

        if (in_array($status, [401, 408, 429, 500, 502, 503, 504], true)) {
            return true;
        }

        if (strpos($code, 'http') !== false || strpos($code, 'mazbot') !== false) {
            if (strpos($message, 'template') !== false && strpos($message, 'missing') !== false) {
                return false;
            }
            return true;
        }

        return false;
    }

    /**
     * @param mixed $order WC_Order
     */
    private static function order_is_cancelled($order): bool {
        if (!method_exists($order, 'get_status')) {
            return false;
        }

        $status = (string) $order->get_status();
        return in_array($status, ['cancelled', 'trash', 'failed'], true);
    }

    /**
     * @param mixed $order WC_Order
     */
    private static function resolve_order_phone($order): string {
        $candidates = [];

        if (method_exists($order, 'get_billing_phone')) {
            $candidates[] = (string) $order->get_billing_phone();
        }
        if (method_exists($order, 'get_shipping_phone')) {
            $candidates[] = (string) $order->get_shipping_phone();
        }

        $user_id = method_exists($order, 'get_user_id') ? (int) $order->get_user_id() : 0;
        if ($user_id > 0) {
            $candidates[] = (string) get_user_meta($user_id, 'billing_phone', true);
            $candidates[] = (string) get_user_meta($user_id, 'phone', true);
            $candidates[] = (string) get_user_meta($user_id, 'mobile', true);
        }

        foreach ($candidates as $candidate) {
            $normalized = self::normalize_phone($candidate);
            if ($normalized !== '') {
                return $normalized;
            }
        }

        return '';
    }

    /**
     * Keep readiness check: need named line items. Allow zero totals only when items exist
     * is still blocked by total>0 in older logic — plan says permit zero-value if items exist.
     *
     * @param mixed $order WC_Order
     */
    private static function order_ready_for_whatsapp($order): bool {
        return self::order_has_billable_items($order);
    }

    /**
     * Legacy sync path — redirect to queue.
     */
    private static function maybe_send_order_whatsapp(int $order_id): void {
        self::queue_order_whatsapp($order_id, 'legacy');
    }

    private static function push_order_history(array $entry): void {
        $history = get_option(self::ORDER_WA_HISTORY_OPTION, []);
        if (!is_array($history)) {
            $history = [];
        }

        array_unshift($history, $entry);
        $history = array_slice($history, 0, 20);
        update_option(self::ORDER_WA_HISTORY_OPTION, $history, false);
        self::store_last_order_wa($entry);
    }

    private static function log_order(string $level, string $message, array $context = []): void {
        if (!function_exists('wc_get_logger')) {
            return;
        }

        $logger = wc_get_logger();
        $logger->log($level, $message . ' ' . wp_json_encode($context, JSON_UNESCAPED_UNICODE), [
            'source' => 'sokany-whatsapp-otp',
        ]);
    }

    public static function handle_resend_order_wa(): void {
        if (!current_user_can('manage_woocommerce') && !current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }

        check_admin_referer('sokany_resend_order_wa');

        $order_id = isset($_POST['order_id']) ? (int) $_POST['order_id'] : 0;
        $redirect = wp_get_referer() ?: admin_url('options-general.php?page=sokany-whatsapp-otp');

        if ($order_id < 1 || !function_exists('wc_get_order')) {
            wp_safe_redirect(add_query_arg('mazbot_resend', 'invalid', $redirect));
            exit;
        }

        $order = wc_get_order($order_id);
        if (!$order) {
            wp_safe_redirect(add_query_arg('mazbot_resend', 'missing', $redirect));
            exit;
        }

        $order->delete_meta_data(self::ORDER_WA_STATE_META);
        $order->delete_meta_data(self::ORDER_WA_META);
        $order->delete_meta_data(self::ORDER_WA_LEASE_META);
        $order->delete_meta_data(self::ORDER_WA_LAST_ERROR_META);
        $order->update_meta_data(self::ORDER_WA_ATTEMPTS_META, 0);
        $order->save_meta_data();

        self::queue_order_whatsapp($order_id, 'resend', 1);

        wp_safe_redirect(add_query_arg('mazbot_resend', 'queued', $redirect));
        exit;
    }
}
