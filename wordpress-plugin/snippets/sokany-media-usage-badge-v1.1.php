/**
 * Snippet Name: SOKANY Media Usage Badge v1.1
 * Description: عمود الارتباط + فلتر + تقارير CSV. v1.1 آمن: لا فحص ثقيل عند فتح المكتبة (يمنع تعليق/404 Hostinger).
 *
 * Code Snippets (sokany-eg.com):
 * - عطّل أي نسخة v1.0 فوراً قبل تفعيل هذه
 * - Do NOT paste a <?php opening tag
 * - Title: SOKANY Media Usage Badge v1.1
 * - Run snippet: Only run in administration area
 * - Save & Activate
 * - Media → تقارير الارتباط → فحص دفعات صغيرة
 * - Media → Library (List view) لرؤية العمود بعد الفحص
 *
 * Source: wordpress-plugin/snippets/sokany-media-usage-badge-v1.1.php
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!is_admin()) {
    return;
}

const SOKANY_MU_META_STATUS = '_sokany_media_usage';
const SOKANY_MU_META_SCORE  = '_sokany_media_usage_score';
const SOKANY_MU_META_NOTES  = '_sokany_media_usage_notes';
const SOKANY_MU_META_AT     = '_sokany_media_usage_at';

/** Max attachments per batch request (keep Hostinger under timeout). */
const SOKANY_MU_BATCH_SIZE = 8;

/** Soft time budget (seconds) inside one batch. */
const SOKANY_MU_BATCH_SECONDS = 8;

/**
 * Fast checks only: thumbnail, gallery ID list, post_parent.
 * Optional light content LIKE (uploads path / long basename) — never full postmeta scan.
 *
 * @return array{status:string,score:int,notes:string[]}
 */
function sokany_mu_analyze_attachment($attachment_id) {
    global $wpdb;

    $attachment_id = (int) $attachment_id;
    $score = 0;
    $notes = [];

    if ($attachment_id < 1 || get_post_type($attachment_id) !== 'attachment') {
        return ['status' => 'unused', 'score' => 0, 'notes' => ['مرفق غير صالح']];
    }

    $mime = (string) get_post_mime_type($attachment_id);
    if ($mime && strpos($mime, 'image/') !== 0) {
        return ['status' => 'review', 'score' => 50, 'notes' => ['ليس صورة — راجع يدوياً']];
    }

    // Featured image / thumbnail (indexed equality — cheap)
    $thumb_posts = $wpdb->get_col(
        $wpdb->prepare(
            "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_thumbnail_id' AND meta_value = %s LIMIT 10",
            (string) $attachment_id
        )
    );
    if ($thumb_posts) {
        $score += 100;
        foreach (array_slice($thumb_posts, 0, 3) as $pid) {
            $title = get_the_title((int) $pid) ?: ('#' . $pid);
            $notes[] = 'صورة رئيسية: ' . $title;
        }
    }

    // Woo product gallery — exact CSV id match only (no leading-wildcard LIKE)
    $id = (string) $attachment_id;
    $gallery_posts = $wpdb->get_col(
        $wpdb->prepare(
            "SELECT post_id FROM {$wpdb->postmeta}
             WHERE meta_key = '_product_image_gallery'
               AND (
                    meta_value = %s
                 OR meta_value LIKE %s
                 OR meta_value LIKE %s
                 OR meta_value LIKE %s
               )
             LIMIT 10",
            $id,
            $id . ',%',
            '%,' . $id . ',%',
            '%,' . $id
        )
    );
    if ($gallery_posts) {
        $score += 100;
        foreach (array_slice($gallery_posts, 0, 3) as $pid) {
            $title = get_the_title((int) $pid) ?: ('#' . $pid);
            $notes[] = 'معرض منتج: ' . $title;
        }
    }

    // Attached to a parent post
    $parent = (int) wp_get_post_parent_id($attachment_id);
    if ($parent > 0 && get_post_status($parent)) {
        $score += 80;
        $notes[] = 'مرفق بالمنشور: ' . (get_the_title($parent) ?: ('#' . $parent));
    }

    // If still unused: one light content check (uploads-relative path or long basename only).
    // No full-URL LIKE and no postmeta table scan (those caused Hostinger 404 timeouts).
    if ($score < 100) {
        $file = get_attached_file($attachment_id);
        $basename = $file ? wp_basename($file) : '';
        $uploads = wp_get_upload_dir();
        $basedir = isset($uploads['basedir']) ? (string) $uploads['basedir'] : '';
        $relative = '';
        if ($file && $basedir && strpos($file, $basedir) === 0) {
            $relative = ltrim(str_replace('\\', '/', substr($file, strlen($basedir))), '/');
        }

        $needle = '';
        if ($relative && strlen($relative) >= 12) {
            $needle = $relative;
        } elseif ($basename && strlen($basename) >= 16) {
            $needle = $basename;
        }

        if ($needle) {
            $found = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT ID, post_title FROM {$wpdb->posts}
                     WHERE post_status = 'publish'
                       AND post_type NOT IN ('attachment','revision','nav_menu_item')
                       AND post_content LIKE %s
                     LIMIT 1",
                    '%' . $wpdb->esc_like($needle) . '%'
                )
            );
            if ($found) {
                $score += 100;
                $notes[] = 'في محتوى منشور: ' . ($found->post_title ?: ('#' . $found->ID));
            }
        }
    }

    if ($score >= 100) {
        $status = 'linked';
    } elseif ($score > 0) {
        $status = 'review';
    } else {
        $status = 'unused';
        $notes[] = 'لا إشارات استخدام حسب الفحص السريع';
    }

    return [
        'status' => $status,
        'score'  => min(100, $score > 100 ? 100 : $score),
        'notes'  => array_values(array_unique($notes)),
    ];
}

function sokany_mu_save_analysis($attachment_id, array $analysis) {
    update_post_meta($attachment_id, SOKANY_MU_META_STATUS, $analysis['status']);
    update_post_meta($attachment_id, SOKANY_MU_META_SCORE, (int) $analysis['score']);
    update_post_meta($attachment_id, SOKANY_MU_META_NOTES, wp_json_encode($analysis['notes'], JSON_UNESCAPED_UNICODE));
    update_post_meta($attachment_id, SOKANY_MU_META_AT, time());
}

/**
 * Cache-only read. Never runs analyze on miss (prevents library page hangs).
 *
 * @return array{status:string,score:int,notes:string[]}|null null = not scanned yet
 */
function sokany_mu_get_cached_analysis($attachment_id) {
    $attachment_id = (int) $attachment_id;
    $status = get_post_meta($attachment_id, SOKANY_MU_META_STATUS, true);
    if (!in_array($status, ['linked', 'review', 'unused'], true)) {
        return null;
    }
    $notes_raw = get_post_meta($attachment_id, SOKANY_MU_META_NOTES, true);
    $notes = json_decode((string) $notes_raw, true);
    if (!is_array($notes)) {
        $notes = [];
    }
    return [
        'status' => $status,
        'score'  => (int) get_post_meta($attachment_id, SOKANY_MU_META_SCORE, true),
        'notes'  => $notes,
    ];
}

/**
 * @return array{status:string,score:int,notes:string[]}
 */
function sokany_mu_get_analysis($attachment_id, $force = false) {
    $attachment_id = (int) $attachment_id;
    if (!$force) {
        $cached = sokany_mu_get_cached_analysis($attachment_id);
        if ($cached !== null) {
            return $cached;
        }
        return [
            'status' => 'unscanned',
            'score'  => 0,
            'notes'  => ['لم يُفحص بعد'],
        ];
    }

    $analysis = sokany_mu_analyze_attachment($attachment_id);
    sokany_mu_save_analysis($attachment_id, $analysis);
    return $analysis;
}

function sokany_mu_status_label($status) {
    if ($status === 'linked') {
        return 'مرتبطة 100%';
    }
    if ($status === 'review') {
        return 'راجعي قبل الحذف';
    }
    if ($status === 'unscanned') {
        return 'لم يُفحص بعد';
    }
    return 'غير مرتبطة';
}

function sokany_mu_status_style($status) {
    if ($status === 'linked') {
        return 'background:#166534;color:#fff;';
    }
    if ($status === 'review') {
        return 'background:#ca8a04;color:#111;';
    }
    if ($status === 'unscanned') {
        return 'background:#6b7280;color:#fff;';
    }
    return 'background:#b91c1c;color:#fff;';
}

/** Column — cache only, never analyze */
add_filter('manage_upload_columns', function ($cols) {
    $cols['sokany_usage'] = 'الارتباط';
    return $cols;
});

add_action('manage_media_custom_column', function ($col, $post_id) {
    if ($col !== 'sokany_usage') {
        return;
    }
    $cached = sokany_mu_get_cached_analysis($post_id);
    if ($cached === null) {
        $status = 'unscanned';
        $title = 'شغّلي الفحص من Media → تقارير الارتباط';
        $label = sokany_mu_status_label('unscanned');
    } else {
        $status = $cached['status'];
        $title = implode(' | ', $cached['notes']);
        $label = sokany_mu_status_label($status);
    }
    printf(
        '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;%s" title="%s">%s</span>',
        esc_attr(sokany_mu_status_style($status)),
        esc_attr($title),
        esc_html($label)
    );
}, 10, 2);

/** Filter dropdown */
add_action('restrict_manage_posts', function () {
    $screen = function_exists('get_current_screen') ? get_current_screen() : null;
    if (!$screen || $screen->id !== 'upload') {
        return;
    }
    $current = isset($_GET['sokany_usage']) ? sanitize_text_field(wp_unslash($_GET['sokany_usage'])) : '';
    echo '<select name="sokany_usage">';
    echo '<option value="">كل حالات الارتباط</option>';
    foreach (
        [
            'linked' => 'مرتبطة 100%',
            'review' => 'راجعي قبل الحذف',
            'unused' => 'غير مرتبطة',
        ] as $key => $label
    ) {
        printf(
            '<option value="%s"%s>%s</option>',
            esc_attr($key),
            selected($current, $key, false),
            esc_html($label)
        );
    }
    echo '</select>';
});

add_action('pre_get_posts', function ($query) {
    if (!is_admin() || !$query->is_main_query()) {
        return;
    }
    $screen = function_exists('get_current_screen') ? get_current_screen() : null;
    if (!$screen || $screen->id !== 'upload') {
        return;
    }
    $status = isset($_GET['sokany_usage']) ? sanitize_text_field(wp_unslash($_GET['sokany_usage'])) : '';
    if (!in_array($status, ['linked', 'review', 'unused'], true)) {
        return;
    }
    $query->set('meta_query', [
        [
            'key'   => SOKANY_MU_META_STATUS,
            'value' => $status,
        ],
    ]);
});

/** Admin menu: reports */
add_action('admin_menu', function () {
    add_media_page(
        'تقارير ارتباط الصور',
        'تقارير الارتباط',
        'upload_files',
        'sokany-media-usage',
        'sokany_mu_render_reports_page'
    );
});

function sokany_mu_query_ids_by_status($status, $limit = 5000) {
    $q = new WP_Query([
        'post_type'      => 'attachment',
        'post_status'    => 'inherit',
        'posts_per_page' => $limit,
        'fields'         => 'ids',
        'no_found_rows'  => true,
        'meta_query'     => [
            [
                'key'   => SOKANY_MU_META_STATUS,
                'value' => $status,
            ],
        ],
    ]);
    return $q->posts ?: [];
}

function sokany_mu_count_by_status($status) {
    $q = new WP_Query([
        'post_type'      => 'attachment',
        'post_status'    => 'inherit',
        'posts_per_page' => 1,
        'fields'         => 'ids',
        'meta_query'     => [
            [
                'key'   => SOKANY_MU_META_STATUS,
                'value' => $status,
            ],
        ],
    ]);
    return (int) $q->found_posts;
}

function sokany_mu_export_csv($status) {
    if (!current_user_can('upload_files')) {
        wp_die('غير مصرح.');
    }
    $ids = sokany_mu_query_ids_by_status($status, 10000);
    $filename = 'sokany-media-' . $status . '-' . gmdate('Y-m-d') . '.csv';

    nocache_headers();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename=' . $filename);

    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['ID', 'العنوان', 'الملف', 'الحجم_بايت', 'التاريخ', 'الدرجة', 'الحالة', 'ملاحظات']);

    foreach ($ids as $id) {
        $analysis = sokany_mu_get_cached_analysis($id);
        if ($analysis === null) {
            continue;
        }
        $file = get_attached_file($id);
        $size = ($file && file_exists($file)) ? filesize($file) : 0;
        fputcsv($out, [
            $id,
            get_the_title($id),
            $file ? wp_basename($file) : '',
            $size,
            get_the_date('Y-m-d H:i', $id),
            (int) $analysis['score'],
            sokany_mu_status_label($analysis['status']),
            implode(' | ', $analysis['notes']),
        ]);
    }
    fclose($out);
    exit;
}

add_action('admin_init', function () {
    if (!isset($_GET['page']) || $_GET['page'] !== 'sokany-media-usage') {
        return;
    }
    if (!isset($_GET['sokany_mu_export'])) {
        return;
    }
    check_admin_referer('sokany_mu_export');
    $status = sanitize_text_field(wp_unslash($_GET['sokany_mu_export']));
    if (!in_array($status, ['linked', 'review', 'unused'], true)) {
        return;
    }
    sokany_mu_export_csv($status);
});

/**
 * Small batch with soft time budget. Prefer unscanned images first.
 *
 * @return array{done:bool,scanned:int,offset:int,total:int,timed_out:bool}
 */
function sokany_mu_run_batch_scan($batch = SOKANY_MU_BATCH_SIZE) {
    $batch = max(1, min(10, (int) $batch));
    $offset_key = 'sokany_mu_scan_offset';
    $offset = (int) get_option($offset_key, 0);
    $started = microtime(true);
    $timed_out = false;

    $q = new WP_Query([
        'post_type'      => 'attachment',
        'post_status'    => 'inherit',
        'post_mime_type' => 'image',
        'posts_per_page' => $batch,
        'offset'         => $offset,
        'fields'         => 'ids',
        'orderby'        => 'ID',
        'order'          => 'ASC',
        'no_found_rows'  => false,
    ]);

    $ids = $q->posts ?: [];
    $scanned = 0;
    foreach ($ids as $id) {
        if ((microtime(true) - $started) >= SOKANY_MU_BATCH_SECONDS) {
            $timed_out = true;
            break;
        }
        sokany_mu_get_analysis((int) $id, true);
        $scanned++;
    }

    $processed_in_page = $scanned;
    // Advance offset by how far we got in this page (even if timed out mid-batch)
    $next = $offset + $processed_in_page;
    $total = (int) $q->found_posts;

    if ($next >= $total || (!$ids && !$timed_out)) {
        update_option($offset_key, 0);
        return [
            'done'       => true,
            'scanned'    => $scanned,
            'offset'     => $offset,
            'total'      => $total,
            'timed_out'  => $timed_out,
        ];
    }

    update_option($offset_key, $next);
    return [
        'done'      => false,
        'scanned'   => $scanned,
        'offset'    => $next,
        'total'     => $total,
        'timed_out' => $timed_out,
    ];
}

add_action('admin_post_sokany_mu_scan', function () {
    if (!current_user_can('upload_files')) {
        wp_die('غير مصرح.');
    }
    check_admin_referer('sokany_mu_scan');
    $result = sokany_mu_run_batch_scan(SOKANY_MU_BATCH_SIZE);
    if ($result['done']) {
        $msg = 'اكتمل الفحص. تمت معالجة المكتبة.';
    } else {
        $msg = 'تم فحص ' . $result['scanned'] . ' — التقدم: ' . $result['offset'] . ' / ' . $result['total'];
        if (!empty($result['timed_out'])) {
            $msg .= ' (توقف عند حد الوقت — اضغطي متابعة)';
        } else {
            $msg .= ' — اضغطي متابعة الفحص مرة أخرى.';
        }
    }
    wp_safe_redirect(admin_url('upload.php?page=sokany-media-usage&sokany_mu_msg=' . rawurlencode($msg)));
    exit;
});

function sokany_mu_render_reports_page() {
    if (!current_user_can('upload_files')) {
        wp_die('غير مصرح.');
    }

    $tab = isset($_GET['tab']) ? sanitize_text_field(wp_unslash($_GET['tab'])) : 'unused';
    if (!in_array($tab, ['linked', 'review', 'unused'], true)) {
        $tab = 'unused';
    }

    $counts = [
        'linked' => sokany_mu_count_by_status('linked'),
        'review' => sokany_mu_count_by_status('review'),
        'unused' => sokany_mu_count_by_status('unused'),
    ];

    $msg = isset($_GET['sokany_mu_msg']) ? sanitize_text_field(wp_unslash($_GET['sokany_mu_msg'])) : '';

    echo '<div class="wrap" dir="rtl">';
    echo '<h1>تقارير ارتباط صور المكتبة <small style="font-weight:400;color:#666;">v1.1</small></h1>';
    echo '<p>الفحص يحفظ الحالة لكل صورة ثم يمكنك الفلترة في المكتبة أو تصدير CSV. <strong>لا يوجد حذف تلقائي.</strong></p>';
    echo '<p style="background:#fef3c7;border:1px solid #f59e0b;padding:10px 12px;border-radius:6px;">';
    echo '<strong>مهم (v1.1):</strong> فتح المكتبة <em>لا يفحص</em> الصور — يظهر «لم يُفحص بعد» حتى تشغّلي الدفعات من هنا. ';
    echo 'كل ضغطة تفحص حوالي ' . (int) SOKANY_MU_BATCH_SIZE . ' صور خلال ~' . (int) SOKANY_MU_BATCH_SECONDS . ' ثوانٍ لتجنّب تعليق Hostinger.';
    echo '</p>';

    if ($msg) {
        echo '<div class="notice notice-success"><p>' . esc_html($msg) . '</p></div>';
    }

    $scan_url = wp_nonce_url(admin_url('admin-post.php?action=sokany_mu_scan'), 'sokany_mu_scan');
    echo '<p><a class="button button-primary" href="' . esc_url($scan_url) . '">فحص / متابعة دفعة صغيرة</a> ';
    echo '<a class="button" href="' . esc_url(admin_url('upload.php?mode=list')) . '">فتح المكتبة (عرض قائمة)</a></p>';

    echo '<ul class="subsubsub">';
    foreach (
        [
            'linked' => 'مرتبطة 100% (' . $counts['linked'] . ')',
            'review' => 'راجعي (' . $counts['review'] . ')',
            'unused' => 'غير مرتبطة (' . $counts['unused'] . ')',
        ] as $key => $label
    ) {
        $url = admin_url('upload.php?page=sokany-media-usage&tab=' . $key);
        $cls = $tab === $key ? 'current' : '';
        echo '<li><a class="' . esc_attr($cls) . '" href="' . esc_url($url) . '">' . esc_html($label) . '</a> | </li>';
    }
    echo '</ul><br class="clear" />';

    $export = wp_nonce_url(
        admin_url('upload.php?page=sokany-media-usage&sokany_mu_export=' . $tab),
        'sokany_mu_export'
    );
    echo '<p><a class="button" href="' . esc_url($export) . '">تصدير CSV — ' . esc_html(sokany_mu_status_label($tab)) . '</a></p>';

    $ids = sokany_mu_query_ids_by_status($tab, 200);
    echo '<table class="widefat striped"><thead><tr>';
    echo '<th>ID</th><th>معاينة</th><th>العنوان</th><th>الدرجة</th><th>ملاحظات</th><th></th>';
    echo '</tr></thead><tbody>';

    if (!$ids) {
        echo '<tr><td colspan="6">لا نتائج لهذا التصنيف. شغّلي «فحص دفعة صغيرة» عدة مرات أولاً إن كانت الأعداد صفراً.</td></tr>';
    }

    foreach ($ids as $id) {
        $analysis = sokany_mu_get_cached_analysis($id);
        if ($analysis === null) {
            continue;
        }
        $thumb = wp_get_attachment_image($id, [60, 60], true);
        $edit = get_edit_post_link($id, 'raw');
        echo '<tr>';
        echo '<td>' . (int) $id . '</td>';
        echo '<td>' . $thumb . '</td>';
        echo '<td>' . esc_html(get_the_title($id)) . '</td>';
        echo '<td>' . (int) $analysis['score'] . '</td>';
        echo '<td>' . esc_html(implode(' | ', $analysis['notes'])) . '</td>';
        echo '<td>' . ($edit ? '<a href="' . esc_url($edit) . '">فتح</a>' : '') . '</td>';
        echo '</tr>';
    }
    echo '</tbody></table>';

    if (count($ids) >= 200) {
        echo '<p>يُعرض أول 200 صف — استخدمي تصدير CSV للقائمة الكاملة.</p>';
    }

    echo '</div>';
}
