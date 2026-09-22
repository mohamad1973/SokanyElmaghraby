/**
 * Snippet Name: SOKANY Media Usage Badge v1.2
 * Description: عمود الارتباط + فحص صورة واحدة / المحدد من القائمة (AJAX) + ملاحظات ظاهرة + فلتر + تقارير CSV. بدون فحص ثقيل عند فتح المكتبة.
 *
 * Code Snippets (sokany-eg.com):
 * - عطّل v1.0 و v1.1 قبل تفعيل هذه
 * - Do NOT paste a <?php opening tag
 * - Title: SOKANY Media Usage Badge v1.2
 * - Run snippet: Only run in administration area
 * - Save & Activate
 * - Media → Library (List view): زر «فحص» أو «فحص المحدد»
 * - Media → تقارير الارتباط للدفعات الجماعية وCSV
 *
 * Source: wordpress-plugin/snippets/sokany-media-usage-badge-v1.2.php
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

const SOKANY_MU_BATCH_SIZE    = 8;
const SOKANY_MU_BATCH_SECONDS = 8;
const SOKANY_MU_BULK_MAX      = 5;

/**
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

    $parent = (int) wp_get_post_parent_id($attachment_id);
    if ($parent > 0 && get_post_status($parent)) {
        $score += 80;
        $notes[] = 'مرفق بالمنشور: ' . (get_the_title($parent) ?: ('#' . $parent));
    }

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
 * @return array{status:string,score:int,notes:string[]}|null
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

/**
 * @param array{status:string,score:int,notes:string[]}|null $cached
 */
function sokany_mu_render_cell_html($attachment_id, $cached) {
    $attachment_id = (int) $attachment_id;
    $html = '<div class="sokany-mu-cell" data-id="' . esc_attr((string) $attachment_id) . '" style="max-width:220px;">';

    if ($cached === null) {
        $html .= '<span class="sokany-mu-badge" style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;'
            . esc_attr(sokany_mu_status_style('unscanned')) . '">'
            . esc_html(sokany_mu_status_label('unscanned')) . '</span>';
        $html .= ' <button type="button" class="button-link sokany-mu-scan-one" data-id="'
            . esc_attr((string) $attachment_id) . '" style="margin-right:4px;vertical-align:middle;">فحص</button>';
        $html .= '<div class="sokany-mu-notes" style="font-size:11px;color:#666;margin-top:4px;line-height:1.35;">اضغطي فحص للتأكيد</div>';
    } else {
        $notes_text = implode(' | ', $cached['notes']);
        $html .= '<span class="sokany-mu-badge" style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;'
            . esc_attr(sokany_mu_status_style($cached['status'])) . '" title="' . esc_attr($notes_text) . '">'
            . esc_html(sokany_mu_status_label($cached['status'])) . '</span>';
        $html .= ' <button type="button" class="button-link sokany-mu-scan-one" data-id="'
            . esc_attr((string) $attachment_id) . '" title="إعادة الفحص" style="margin-right:4px;vertical-align:middle;font-size:11px;">إعادة</button>';
        $html .= '<div class="sokany-mu-notes" style="font-size:11px;color:#444;margin-top:4px;line-height:1.35;">'
            . esc_html($notes_text) . '</div>';
    }

    $html .= '</div>';
    return $html;
}

add_filter('manage_upload_columns', function ($cols) {
    $cols['sokany_usage'] = 'الارتباط';
    return $cols;
});

add_action('manage_media_custom_column', function ($col, $post_id) {
    if ($col !== 'sokany_usage') {
        return;
    }
    echo sokany_mu_render_cell_html($post_id, sokany_mu_get_cached_analysis($post_id)); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
}, 10, 2);

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
    echo ' <button type="button" class="button" id="sokany-mu-scan-selected">فحص المحدد (حد ' . (int) SOKANY_MU_BULK_MAX . ')</button>';
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

add_action('wp_ajax_sokany_mu_scan_one', function () {
    if (!current_user_can('upload_files')) {
        wp_send_json_error(['message' => 'غير مصرح'], 403);
    }
    check_ajax_referer('sokany_mu_ajax', 'nonce');

    $id = isset($_POST['id']) ? (int) $_POST['id'] : 0;
    if ($id < 1 || get_post_type($id) !== 'attachment') {
        wp_send_json_error(['message' => 'مرفق غير صالح'], 400);
    }

    $analysis = sokany_mu_get_analysis($id, true);
    wp_send_json_success([
        'id'   => $id,
        'html' => sokany_mu_render_cell_html($id, $analysis),
    ]);
});

add_action('admin_enqueue_scripts', function ($hook) {
    if ($hook !== 'upload.php') {
        return;
    }

    wp_enqueue_script('jquery');
    $cfg = [
        'ajaxUrl'  => admin_url('admin-ajax.php'),
        'nonce'    => wp_create_nonce('sokany_mu_ajax'),
        'bulkMax'  => (int) SOKANY_MU_BULK_MAX,
        'bulkLabel'=> 'فحص المحدد (حد ' . (int) SOKANY_MU_BULK_MAX . ')',
    ];

    $js = 'jQuery(function($){var C=' . wp_json_encode($cfg) . ';'
        . 'function scanOne(id,$btn){'
        . 'var d=$.Deferred();'
        . 'if($btn&&$btn.length){$btn.prop("disabled",true).text("...");}'
        . '$.post(C.ajaxUrl,{action:"sokany_mu_scan_one",nonce:C.nonce,id:id})'
        . '.done(function(res){'
        . 'if(!res||!res.success||!res.data||!res.data.html){'
        . 'var m=(res&&res.data&&res.data.message)||"فشل الفحص";'
        . 'alert("فشل فحص #"+id+": "+m);'
        . 'if($btn&&$btn.length){$btn.prop("disabled",false).text("فحص");}'
        . 'd.resolve();return;}'
        . 'var $cell=$(\'.sokany-mu-cell[data-id="\'+id+\'"]\');'
        . 'if($cell.length){$cell.replaceWith(res.data.html);}'
        . 'd.resolve();'
        . '}).fail(function(xhr){'
        . 'var msg=(xhr&&xhr.responseJSON&&xhr.responseJSON.data&&xhr.responseJSON.data.message)||"خطأ";'
        . 'alert("فشل فحص #"+id+": "+msg);'
        . 'if($btn&&$btn.length){$btn.prop("disabled",false).text("فحص");}'
        . 'd.resolve();'
        . '});'
        . 'return d.promise();}'
        . '$(document).on("click",".sokany-mu-scan-one",function(e){'
        . 'e.preventDefault();var $btn=$(this);var id=parseInt($btn.data("id"),10);if(!id)return;scanOne(id,$btn);'
        . '});'
        . '$(document).on("click","#sokany-mu-scan-selected",function(e){'
        . 'e.preventDefault();var ids=[];'
        . '$(\'tbody#the-list input[name="media[]"]:checked\').each(function(){var id=parseInt($(this).val(),10);if(id)ids.push(id);});'
        . 'if(!ids.length){alert("حدّدي صوراً من القائمة أولاً.");return;}'
        . 'if(ids.length>C.bulkMax){ids=ids.slice(0,C.bulkMax);alert("سيتم فحص أول "+C.bulkMax+" صور محددة فقط في هذه الضغطة.");}'
        . 'var $btn=$(this);$btn.prop("disabled",true).text("جاري الفحص...");'
        . 'var chain=$.Deferred().resolve();'
        . 'ids.forEach(function(id){chain=chain.then(function(){return scanOne(id,null);});});'
        . 'chain.always(function(){$btn.prop("disabled",false).text(C.bulkLabel);});'
        . '});'
        . '});';

    wp_add_inline_script('jquery', $js);
});

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

    $next = $offset + $scanned;
    $total = (int) $q->found_posts;

    if ($next >= $total || (!$ids && !$timed_out)) {
        update_option($offset_key, 0);
        return [
            'done'      => true,
            'scanned'   => $scanned,
            'offset'    => $offset,
            'total'     => $total,
            'timed_out' => $timed_out,
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
    echo '<h1>تقارير ارتباط صور المكتبة <small style="font-weight:400;color:#666;">v1.2</small></h1>';
    echo '<p>الطريقة الأسهل يومياً: Media → Library (List) → زر <strong>فحص</strong> بجانب الصورة أو <strong>فحص المحدد</strong>. الملاحظات تظهر تحت الشارة بدون فتح روابط.</p>';
    echo '<p>هذه الصفحة للدفعات الجماعية وCSV. <strong>لا يوجد حذف تلقائي.</strong></p>';

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
        echo '<tr><td colspan="6">لا نتائج. افحصي صوراً من المكتبة (زر فحص) أو شغّلي دفعة هنا.</td></tr>';
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
