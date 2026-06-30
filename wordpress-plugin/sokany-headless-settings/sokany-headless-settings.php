<?php
/**
 * Plugin Name: SOKANY Headless Settings
 * Description: REST endpoints for managing the SOKANY Next.js storefront appearance settings.
 * Version: 1.0.0
 * Author: SOKANY Egypt
 */

if (!defined('ABSPATH')) {
    exit;
}

const SOKANY_FRONTEND_SETTINGS_OPTION = 'sokany_frontend_settings';

function sokany_default_frontend_settings() {
    return [
        'brand' => [
            'logoText' => 'SOKANY',
            'tagline' => 'مؤسسة المغربي',
            'primaryColor' => '#DAFF00',
            'primaryColorDark' => '#C1E200',
            'backgroundColor' => '#F4F5F2',
            'fontFamily' => 'Almarai',
        ],
        'topBanner' => [
            'enabled' => true,
            'text' => 'شحن داخل محافظات مصر • ضمان عام • منتجات أصلية من الوكيل الحصري',
            'url' => '/shop',
        ],
        'header' => [
            'ctaText' => 'اطلب الآن',
            'ctaUrl' => '/checkout',
            'showCart' => true,
            'mobileShowSearch' => true,
            'mobileShowCart' => true,
        ],
        'navigation' => [
            ['label' => 'الرئيسية', 'href' => '/'],
            ['label' => 'المتجر', 'href' => '/shop'],
            ['label' => 'العروض', 'href' => '/offers'],
            ['label' => 'الضمان', 'href' => '/warranty'],
            ['label' => 'تواصل معنا', 'href' => '/contact'],
        ],
        'hero' => [
            'enabled' => true,
            'eyebrow' => 'مؤسسة المغربي الوكيل الحصري لسوكاني في مصر',
            'title' => 'سوكاني الأصلية بضمان رسمي وتجربة شراء أسرع من أي متجر تقليدي',
            'subtitle' => 'واجهة حديثة مستوحاة من الشركة الأم، مصممة للبيع في مصر.',
            'primaryCtaText' => 'تسوق المنتجات',
            'primaryCtaUrl' => '/shop',
            'secondaryCtaText' => 'تواصل مع خدمة العملاء',
            'secondaryCtaUrl' => '/contact',
            'desktopImage' => '',
            'mobileImage' => '',
        ],
        'sections' => [
            'trustBadges' => true,
            'categories' => true,
            'bestSellers' => true,
            'competitiveBanner' => true,
        ],
        'footer' => [
            'description' => 'تجربة شراء مباشرة لمنتجات سوكاني الأصلية بضمان لمدة عام ضد عيوب الصناعة وخدمة شحن داخل محافظات الجمهورية.',
            'copyright' => 'SOKANY Egypt. جميع الحقوق محفوظة.',
        ],
    ];
}

function sokany_get_frontend_settings() {
    $settings = get_option(SOKANY_FRONTEND_SETTINGS_OPTION, []);
    return array_replace_recursive(sokany_default_frontend_settings(), is_array($settings) ? $settings : []);
}

function sokany_settings_permission(WP_REST_Request $request) {
    $expected = defined('SOKANY_FRONTEND_SECRET') ? SOKANY_FRONTEND_SECRET : get_option('sokany_frontend_secret', '');
    $provided = $request->get_header('x-sokany-settings-secret');

    if (!empty($expected) && hash_equals($expected, (string) $provided)) {
        return true;
    }

    return current_user_can('manage_options');
}

function sokany_get_menu_slug($item) {
    if (!empty($item->object_id) && in_array($item->object, ['product_cat', 'category'], true)) {
        $term = get_term((int) $item->object_id, $item->object);

        if ($term && !is_wp_error($term)) {
            return $term->slug;
        }
    }

    $path = wp_parse_url($item->url, PHP_URL_PATH);

    if (!$path) {
        return '';
    }

    $parts = array_values(array_filter(explode('/', trim($path, '/'))));

    return end($parts) ?: '';
}

function sokany_build_menu_tree($items, $parent_id = 0) {
    $tree = [];

    foreach ($items as $item) {
        if ((int) $item->menu_item_parent !== (int) $parent_id) {
            continue;
        }

        $node = [
            'id' => (int) $item->ID,
            'title' => html_entity_decode($item->title, ENT_QUOTES, get_bloginfo('charset')),
            'url' => $item->url,
            'type' => $item->type,
            'object' => $item->object,
            'objectId' => (int) $item->object_id,
            'slug' => sokany_get_menu_slug($item),
            'children' => sokany_build_menu_tree($items, (int) $item->ID),
        ];

        $tree[] = $node;
    }

    return $tree;
}

function sokany_get_primary_menu_items() {
    $locations = get_nav_menu_locations();
    $menu = null;

    foreach (['primary', 'main-menu', 'main_menu', 'header-menu', 'header_menu'] as $location) {
        if (!empty($locations[$location])) {
            $menu = wp_get_nav_menu_object($locations[$location]);
            break;
        }
    }

    if (!$menu) {
        $menus = wp_get_nav_menus();
        $menu = !empty($menus) ? $menus[0] : null;
    }

    if (!$menu) {
        return [];
    }

    $items = wp_get_nav_menu_items($menu->term_id, ['update_post_term_cache' => false]);

    if (!$items || is_wp_error($items)) {
        return [];
    }

    return sokany_build_menu_tree($items);
}

add_action('rest_api_init', function () {
    register_rest_route('sokany/v1', '/theme-settings', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => function () {
                return rest_ensure_response(sokany_get_frontend_settings());
            },
            'permission_callback' => '__return_true',
        ],
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => function (WP_REST_Request $request) {
                $settings = $request->get_json_params();

                if (!is_array($settings)) {
                    return new WP_Error('sokany_invalid_settings', 'Invalid settings payload.', ['status' => 400]);
                }

                update_option(SOKANY_FRONTEND_SETTINGS_OPTION, $settings, false);

                return rest_ensure_response(sokany_get_frontend_settings());
            },
            'permission_callback' => 'sokany_settings_permission',
        ],
    ]);

    register_rest_route('sokany/v1', '/menu', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => function () {
                return rest_ensure_response(sokany_get_primary_menu_items());
            },
            'permission_callback' => '__return_true',
        ],
    ]);
});

