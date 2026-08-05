/**
 * Snippet Name: SOKANY Contact Form v1.0
 * Description: فورم اتصل بنا بشكل Next + إرسال SMTP إلى info@sokanyelmaghraby.com (بديل Contact Form 7).
 *
 * Code Snippets:
 * - Do NOT paste a <?php opening tag
 * - Run snippet: Only run on site front-end  (مهم: لازم الشورت كود يظهر؛ لو Run Everywhere برضو شغال)
 * - املأ إعدادات SMTP بالأسفل من Hostinger → Emails
 * - في صفحة اتصل بنا استبدل شورت كود CF7 بـ: [sokany_contact_form]
 * - Activate → امسح الكاش → اختبر إرسال رسالة
 *
 * Source: wordpress-plugin/snippets/sokany-contact-form-v1.0.php
 * Does NOT touch Next.js / Vercel.
 */

if (!defined('ABSPATH')) {
    exit;
}

/** =========================
 *  إعدادات SMTP — املأها من Hostinger
 *  ========================= */
const SOKANY_CF_SMTP_HOST = 'smtp.hostinger.com';
const SOKANY_CF_SMTP_PORT = 465; // 465 SSL أو 587 TLS
const SOKANY_CF_SMTP_SECURE = 'ssl'; // ssl أو tls
const SOKANY_CF_SMTP_USER = 'info@sokanyelmaghraby.com'; // بريد Hostinger
const SOKANY_CF_SMTP_PASS = 'PUT_EMAIL_PASSWORD_HERE'; // كلمة مرور البريد — غيّرها
const SOKANY_CF_MAIL_TO = 'info@sokanyelmaghraby.com';
const SOKANY_CF_MAIL_FROM = 'info@sokanyelmaghraby.com';
const SOKANY_CF_MAIL_FROM_NAME = 'SOKANY Contact Form';

add_shortcode('sokany_contact_form', 'sokany_cf_render_shortcode');

add_action('wp_enqueue_scripts', function () {
    if (is_admin()) {
        return;
    }
    wp_register_style('sokany-cf-style', false, [], '1.0.0');
    wp_enqueue_style('sokany-cf-style');
    wp_add_inline_style('sokany-cf-style', sokany_cf_css());

    wp_register_script('sokany-cf-script', false, [], '1.0.0', true);
    wp_enqueue_script('sokany-cf-script');
    wp_add_inline_script('sokany-cf-script', sokany_cf_js(), 'after');
}, 40);

/* REST يعمل مع Run: front-end (أفضل من admin-ajax مع Code Snippets) */
add_action('rest_api_init', function () {
    register_rest_route('sokany-contact/v1', '/send', [
        'methods' => 'POST',
        'callback' => 'sokany_cf_handle_rest',
        'permission_callback' => '__return_true',
    ]);
});

add_action('phpmailer_init', function ($phpmailer) {
    if (SOKANY_CF_SMTP_PASS === '' || SOKANY_CF_SMTP_PASS === 'PUT_EMAIL_PASSWORD_HERE') {
        return;
    }
    if (empty($GLOBALS['sokany_cf_use_smtp'])) {
        return;
    }
    $phpmailer->isSMTP();
    $phpmailer->Host = SOKANY_CF_SMTP_HOST;
    $phpmailer->SMTPAuth = true;
    $phpmailer->Port = (int) SOKANY_CF_SMTP_PORT;
    $phpmailer->Username = SOKANY_CF_SMTP_USER;
    $phpmailer->Password = SOKANY_CF_SMTP_PASS;
    $secure = strtolower((string) SOKANY_CF_SMTP_SECURE);
    if ($secure === 'ssl' || $secure === 'tls') {
        $phpmailer->SMTPSecure = $secure;
    }
    $phpmailer->From = SOKANY_CF_MAIL_FROM;
    $phpmailer->FromName = SOKANY_CF_MAIL_FROM_NAME;
});

function sokany_cf_render_shortcode(): string {
    $nonce = wp_create_nonce('sokany_contact_form');
    $rest = esc_url_raw(rest_url('sokany-contact/v1/send'));
    ob_start();
    ?>
<div class="sokany-cf-wrap" dir="rtl">
  <h3 class="sokany-cf-title">أرسل رسالة</h3>
  <form class="sokany-cf-form" id="sokany-cf-form" novalidate
        data-rest="<?php echo esc_attr($rest); ?>"
        data-nonce="<?php echo esc_attr($nonce); ?>">
    <input class="sokany-cf-input" type="text" name="name" placeholder="الاسم" required autocomplete="name" />
    <input class="sokany-cf-input" type="tel" name="phone" placeholder="رقم الهاتف" required autocomplete="tel" inputmode="tel" />
    <input class="sokany-cf-input" type="text" name="subject" placeholder="موضوع الرسالة" autocomplete="off" />
    <textarea class="sokany-cf-input sokany-cf-textarea" name="message" placeholder="اكتب رسالتك" required rows="5"></textarea>
    <input class="sokany-cf-hp" type="text" name="website" value="" tabindex="-1" autocomplete="off" aria-hidden="true" />
    <button class="sokany-cf-btn" type="submit">إرسال الرسالة</button>
    <p class="sokany-cf-msg" id="sokany-cf-msg" hidden></p>
  </form>
</div>
    <?php
    return (string) ob_get_clean();
}

function sokany_cf_handle_rest(WP_REST_Request $request) {
    $nonce = (string) $request->get_param('nonce');
    if (!wp_verify_nonce($nonce, 'sokany_contact_form')) {
        return new WP_Error('sokany_cf_nonce', 'انتهت صلاحية الجلسة. حدّث الصفحة وحاول مرة أخرى.', ['status' => 403]);
    }

    $website = trim((string) $request->get_param('website'));
    if ($website !== '') {
        return rest_ensure_response(['ok' => true, 'message' => 'تم إرسال رسالتك بنجاح. شكرًا لتواصلك.']);
    }

    $name = sanitize_text_field((string) $request->get_param('name'));
    $phone = sanitize_text_field((string) $request->get_param('phone'));
    $subject = sanitize_text_field((string) $request->get_param('subject'));
    $message = sanitize_textarea_field((string) $request->get_param('message'));

    if ($name === '' || $phone === '' || $message === '') {
        return new WP_Error('sokany_cf_required', 'من فضلك أكمل الاسم ورقم الهاتف والرسالة.', ['status' => 400]);
    }

    $digits = preg_replace('/\D+/', '', $phone);
    if (!is_string($digits) || strlen($digits) < 10 || strlen($digits) > 15) {
        return new WP_Error('sokany_cf_phone', 'رقم الهاتف غير صحيح.', ['status' => 400]);
    }

    if (SOKANY_CF_SMTP_PASS === '' || SOKANY_CF_SMTP_PASS === 'PUT_EMAIL_PASSWORD_HERE') {
        return new WP_Error(
            'sokany_cf_smtp',
            'لم يتم ضبط كلمة مرور SMTP في السنابت بعد. افتح السنابت واملأ SOKANY_CF_SMTP_PASS.',
            ['status' => 500]
        );
    }

    $mail_subject = $subject !== ''
        ? ('رسالة تواصل: ' . $subject . ' — ' . $name)
        : ('رسالة تواصل من ' . $name);

    $body = "رسالة جديدة من فورم اتصل بنا\n\n"
        . "الاسم: {$name}\n"
        . "الهاتف: {$phone}\n"
        . "الموضوع: " . ($subject !== '' ? $subject : '—') . "\n\n"
        . "الرسالة:\n{$message}\n";

    $headers = [
        'Content-Type: text/plain; charset=UTF-8',
        'From: ' . SOKANY_CF_MAIL_FROM_NAME . ' <' . SOKANY_CF_MAIL_FROM . '>',
    ];

    $GLOBALS['sokany_cf_use_smtp'] = true;
    $sent = wp_mail(SOKANY_CF_MAIL_TO, $mail_subject, $body, $headers);
    $GLOBALS['sokany_cf_use_smtp'] = false;

    if (!$sent) {
        return new WP_Error('sokany_cf_mail', 'تعذر إرسال الرسالة الآن. راجع بيانات SMTP أو حاول لاحقًا.', ['status' => 500]);
    }

    return rest_ensure_response(['ok' => true, 'message' => 'تم إرسال رسالتك بنجاح. شكرًا لتواصلك.']);
}

function sokany_cf_css(): string {
    return <<<'CSS'
.sokany-cf-wrap{
  max-width:560px;
  background:#fff;
  border:1px solid rgba(0,0,0,.08);
  border-radius:22px;
  padding:22px 18px 20px;
  box-sizing:border-box;
}
.sokany-cf-title{
  margin:0 0 16px;
  font-size:22px;
  font-weight:800;
  color:#111;
  text-align:right;
}
.sokany-cf-form{display:grid;gap:14px;}
.sokany-cf-input{
  width:100%;
  box-sizing:border-box;
  border:1px solid rgba(0,0,0,.1);
  background:#f5f5f3;
  border-radius:18px;
  padding:14px 16px;
  font-size:15px;
  color:#111;
  outline:none;
}
.sokany-cf-input:focus{
  background:#fff;
  border-color:#daff00;
}
.sokany-cf-textarea{min-height:140px;resize:vertical;}
.sokany-cf-btn{
  width:100%;
  border:0;
  border-radius:18px;
  background:#daff00;
  color:#111;
  font-size:16px;
  font-weight:800;
  padding:14px 18px;
  cursor:pointer;
}
.sokany-cf-btn:hover{filter:brightness(.97);}
.sokany-cf-btn:disabled{opacity:.7;cursor:wait;}
.sokany-cf-msg{
  margin:0;
  border-radius:16px;
  padding:12px 14px;
  font-size:14px;
  font-weight:700;
}
.sokany-cf-msg.is-ok{background:#ecfdf5;color:#065f46;}
.sokany-cf-msg.is-err{background:#fef2f2;color:#991b1b;}
.sokany-cf-hp{
  position:absolute!important;
  left:-9999px!important;
  width:1px!important;height:1px!important;
  opacity:0!important;overflow:hidden!important;
}
CSS;
}

function sokany_cf_js(): string {
    return <<<'JS'
(function(){
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn);else fn();}
  ready(function(){
    var form=document.getElementById('sokany-cf-form');
    if(!form)return;
    var msg=document.getElementById('sokany-cf-msg');
    var btn=form.querySelector('.sokany-cf-btn');
    form.addEventListener('submit',function(e){
      e.preventDefault();
      if(!msg||!btn)return;
      msg.hidden=true;
      msg.className='sokany-cf-msg';
      btn.disabled=true;
      var fd=new FormData(form);
      fd.append('nonce',form.getAttribute('data-nonce')||'');
      fetch(form.getAttribute('data-rest')||'/wp-json/sokany-contact/v1/send',{
        method:'POST',
        credentials:'same-origin',
        body:fd
      }).then(function(r){return r.json().then(function(j){return {ok:r.ok,status:r.status,j:j};});})
      .then(function(res){
        var payload=res.j||{};
        if(res.ok&&payload.ok){
          msg.textContent=payload.message||'تم إرسال رسالتك بنجاح.';
          msg.className='sokany-cf-msg is-ok';
          msg.hidden=false;
          form.reset();
          return;
        }
        var text=(payload.message)||(payload.data&&payload.data.message)||'حدث خطأ أثناء الإرسال.';
        msg.textContent=text;
        msg.className='sokany-cf-msg is-err';
        msg.hidden=false;
      }).catch(function(){
        msg.textContent='تعذر الاتصال بالخادم. حاول مرة أخرى.';
        msg.className='sokany-cf-msg is-err';
        msg.hidden=false;
      }).finally(function(){btn.disabled=false;});
    });
  });
})();
JS;
}
