/**
 * Snippet Name: SOKANY Contact Form v1.1.1
 * Description: إصلاح اختفاء الفورم — استبدال آمن لـ CF7 بشكل Next + SMTP إلى info@sokanyelmaghraby.com.
 *
 * Code Snippets:
 * - Do NOT paste a <?php opening tag
 * - عطّل v1.0 و v1.1 بالكامل قبل التفعيل
 * - Run snippet: Run everywhere
 * - املأ SOKANY_CF111_SMTP_PASS من Hostinger Emails
 * - Activate → امسح الكاش → افتح /contact-us/
 *
 * Source: wordpress-plugin/snippets/sokany-contact-form-v1.1.1.php
 * Does NOT touch Next.js / Vercel.
 */

if (!defined('ABSPATH')) {
    exit;
}

/** =========================
 *  إعدادات SMTP — املأها من Hostinger
 *  ========================= */
const SOKANY_CF111_SMTP_HOST = 'smtp.hostinger.com';
const SOKANY_CF111_SMTP_PORT = 465;
const SOKANY_CF111_SMTP_SECURE = 'ssl';
const SOKANY_CF111_SMTP_USER = 'info@sokanyelmaghraby.com';
const SOKANY_CF111_SMTP_PASS = 'PUT_EMAIL_PASSWORD_HERE'; // غيّرها لكلمة مرور البريد
const SOKANY_CF111_MAIL_TO = 'info@sokanyelmaghraby.com';
const SOKANY_CF111_MAIL_FROM = 'info@sokanyelmaghraby.com';
const SOKANY_CF111_MAIL_FROM_NAME = 'SOKANY Contact Form';

add_shortcode('sokany_contact_form', 'sokany_cf111_render_form');

/* استبدال PHP مباشر لأي contact-form-7 (أضمن من JS) */
add_filter('do_shortcode_tag', function ($output, $tag) {
    if ($tag === 'contact-form-7') {
        return sokany_cf111_render_form();
    }
    return $output;
}, 20, 2);

/* لو الصفحة فاضية تمامًا من أي فورم — أضف الفورم في المحتوى */
add_filter('the_content', function ($content) {
    if (is_admin() || !sokany_cf111_is_contact_request()) {
        return $content;
    }
    if (is_string($content) && strpos($content, 'data-sokany-cf="1"') !== false) {
        return $content;
    }
    return sokany_cf111_render_form() . $content;
}, 99);

add_action('wp_enqueue_scripts', function () {
    if (is_admin()) {
        return;
    }
    wp_register_style('sokany-cf111-style', false, [], '1.1.1');
    wp_enqueue_style('sokany-cf111-style');
    wp_add_inline_style('sokany-cf111-style', sokany_cf111_css());

    wp_register_script('sokany-cf111-script', false, [], '1.1.1', true);
    wp_enqueue_script('sokany-cf111-script');
    wp_localize_script('sokany-cf111-script', 'SOKANY_CF111', [
        'rest' => esc_url_raw(rest_url('sokany-contact/v1/send')),
        'nonce' => wp_create_nonce('sokany_contact_form'),
        'isContact' => sokany_cf111_is_contact_request() ? 1 : 0,
    ]);
    wp_add_inline_script('sokany-cf111-script', sokany_cf111_js(), 'after');
}, 40);

/* قالب HTML في الفوتر — بدون localize HTML (كان سبب الاختفاء) */
add_action('wp_footer', function () {
    if (is_admin()) {
        return;
    }
    echo '<template id="sokany-cf-template">' . sokany_cf111_render_form() . '</template>';
}, 5);

add_action('rest_api_init', function () {
    register_rest_route('sokany-contact/v1', '/send', [
        'methods' => 'POST',
        'callback' => 'sokany_cf111_handle_rest',
        'permission_callback' => '__return_true',
    ]);
});

add_action('phpmailer_init', function ($phpmailer) {
    if (SOKANY_CF111_SMTP_PASS === '' || SOKANY_CF111_SMTP_PASS === 'PUT_EMAIL_PASSWORD_HERE') {
        return;
    }
    if (empty($GLOBALS['sokany_cf111_use_smtp'])) {
        return;
    }
    $phpmailer->isSMTP();
    $phpmailer->Host = SOKANY_CF111_SMTP_HOST;
    $phpmailer->SMTPAuth = true;
    $phpmailer->Port = (int) SOKANY_CF111_SMTP_PORT;
    $phpmailer->Username = SOKANY_CF111_SMTP_USER;
    $phpmailer->Password = SOKANY_CF111_SMTP_PASS;
    $secure = strtolower((string) SOKANY_CF111_SMTP_SECURE);
    if ($secure === 'ssl' || $secure === 'tls') {
        $phpmailer->SMTPSecure = $secure;
    }
    $phpmailer->From = SOKANY_CF111_MAIL_FROM;
    $phpmailer->FromName = SOKANY_CF111_MAIL_FROM_NAME;
});

function sokany_cf111_is_contact_request(): bool {
    $uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
    if (stripos($uri, 'contact-us') !== false || stripos($uri, 'contact') !== false) {
        return true;
    }
    if (function_exists('is_page') && (is_page('contact-us') || is_page('contact'))) {
        return true;
    }
    return false;
}

function sokany_cf111_render_form(): string {
    $nonce = wp_create_nonce('sokany_contact_form');
    $rest = esc_url_raw(rest_url('sokany-contact/v1/send'));
    $uid = 'sokany-cf-form-' . uniqid();
    ob_start();
    ?>
<div class="sokany-cf-wrap" dir="rtl" data-sokany-cf="1">
  <h3 class="sokany-cf-title">أرسل رسالة</h3>
  <form class="sokany-cf-form" id="<?php echo esc_attr($uid); ?>" novalidate
        data-rest="<?php echo esc_attr($rest); ?>"
        data-nonce="<?php echo esc_attr($nonce); ?>">
    <input class="sokany-cf-input" type="text" name="name" placeholder="الاسم" required autocomplete="name" />
    <input class="sokany-cf-input" type="tel" name="phone" placeholder="رقم الهاتف" required autocomplete="tel" inputmode="tel" />
    <input class="sokany-cf-input" type="text" name="subject" placeholder="موضوع الرسالة" autocomplete="off" />
    <textarea class="sokany-cf-input sokany-cf-textarea" name="message" placeholder="اكتب رسالتك" required rows="5"></textarea>
    <input class="sokany-cf-hp" type="text" name="website" value="" tabindex="-1" autocomplete="off" aria-hidden="true" />
    <button class="sokany-cf-btn" type="submit">إرسال الرسالة</button>
    <p class="sokany-cf-msg" hidden></p>
  </form>
</div>
    <?php
    return (string) ob_get_clean();
}

function sokany_cf111_handle_rest(WP_REST_Request $request) {
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

    if (SOKANY_CF111_SMTP_PASS === '' || SOKANY_CF111_SMTP_PASS === 'PUT_EMAIL_PASSWORD_HERE') {
        return new WP_Error(
            'sokany_cf_smtp',
            'لم يتم ضبط كلمة مرور SMTP. افتح السنابت واملأ SOKANY_CF111_SMTP_PASS من Hostinger.',
            ['status' => 500]
        );
    }

    $mail_subject = $subject !== ''
        ? ('رسالة تواصل: ' . $subject . ' — ' . $name)
        : ('رسالة تواصل من ' . $name);

    $body = "رسالة جديدة من فورم اتصل بنا (sokany-eg.com)\n\n"
        . "الاسم: {$name}\n"
        . "الهاتف: {$phone}\n"
        . "الموضوع: " . ($subject !== '' ? $subject : '—') . "\n\n"
        . "الرسالة:\n{$message}\n";

    $headers = [
        'Content-Type: text/plain; charset=UTF-8',
        'From: ' . SOKANY_CF111_MAIL_FROM_NAME . ' <' . SOKANY_CF111_MAIL_FROM . '>',
    ];

    $GLOBALS['sokany_cf111_use_smtp'] = true;
    $sent = wp_mail(SOKANY_CF111_MAIL_TO, $mail_subject, $body, $headers);
    $GLOBALS['sokany_cf111_use_smtp'] = false;

    if (!$sent) {
        return new WP_Error('sokany_cf_mail', 'تعذر إرسال الرسالة. راجع كلمة مرور SMTP أو إعدادات Hostinger.', ['status' => 500]);
    }

    return rest_ensure_response(['ok' => true, 'message' => 'تم إرسال رسالتك بنجاح. شكرًا لتواصلك.']);
}

function sokany_cf111_css(): string {
    return <<<'CSS'
/* نخفي CF7 فقط لو فورم سوكاني ظاهر فعلاً بجانبه/في الصفحة */
body.sokany-cf-ready .wpcf7{display:none!important;}

.sokany-cf-wrap{
  max-width:560px;
  width:100%;
  background:#fff;
  border:1px solid rgba(0,0,0,.08);
  border-radius:22px;
  padding:22px 18px 20px;
  box-sizing:border-box;
  margin:12px 0 20px;
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
.sokany-cf-input:focus{background:#fff;border-color:#daff00;}
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

function sokany_cf111_js(): string {
    return <<<'JS'
(function(){
  function cloneForm(){
    var tpl=document.getElementById('sokany-cf-template');
    if(!tpl||!tpl.content)return null;
    var node=tpl.content.querySelector('.sokany-cf-wrap');
    if(!node)return null;
    var clone=node.cloneNode(true);
    var form=clone.querySelector('.sokany-cf-form');
    if(form){
      form.id='sokany-cf-form-'+Date.now();
      if(window.SOKANY_CF111){
        form.setAttribute('data-rest',SOKANY_CF111.rest||'');
        form.setAttribute('data-nonce',SOKANY_CF111.nonce||'');
      }
    }
    return clone;
  }

  function bindForm(form){
    if(!form||form.getAttribute('data-sokany-bound')==='1')return;
    form.setAttribute('data-sokany-bound','1');
    var msg=form.querySelector('.sokany-cf-msg');
    var btn=form.querySelector('.sokany-cf-btn');
    form.addEventListener('submit',function(e){
      e.preventDefault();
      if(!msg||!btn)return;
      msg.hidden=true;
      msg.className='sokany-cf-msg';
      btn.disabled=true;
      var fd=new FormData(form);
      fd.append('nonce',form.getAttribute('data-nonce')||(window.SOKANY_CF111&&SOKANY_CF111.nonce)||'');
      var url=form.getAttribute('data-rest')||(window.SOKANY_CF111&&SOKANY_CF111.rest)||'/wp-json/sokany-contact/v1/send';
      fetch(url,{method:'POST',credentials:'same-origin',body:fd})
        .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
        .then(function(res){
          var payload=res.j||{};
          if(res.ok&&payload.ok){
            msg.textContent=payload.message||'تم إرسال رسالتك بنجاح.';
            msg.className='sokany-cf-msg is-ok';
            msg.hidden=false;
            form.reset();
            return;
          }
          msg.textContent=payload.message||(payload.data&&payload.data.message)||'حدث خطأ أثناء الإرسال.';
          msg.className='sokany-cf-msg is-err';
          msg.hidden=false;
        })
        .catch(function(){
          msg.textContent='تعذر الاتصال بالخادم. حاول مرة أخرى.';
          msg.className='sokany-cf-msg is-err';
          msg.hidden=false;
        })
        .finally(function(){btn.disabled=false;});
    });
  }

  function ensureVisibleForm(){
    var existing=document.querySelectorAll('.sokany-cf-wrap');
    if(existing.length){
      existing.forEach(function(w){var f=w.querySelector('.sokany-cf-form');if(f)bindForm(f);});
      document.body.classList.add('sokany-cf-ready');
      return;
    }

    var cf7=document.querySelectorAll('.wpcf7');
    if(cf7.length){
      cf7.forEach(function(cf){
        var clone=cloneForm();
        if(!clone)return;
        if(cf.parentNode){cf.parentNode.insertBefore(clone,cf);}
        var f=clone.querySelector('.sokany-cf-form');
        if(f)bindForm(f);
      });
      if(document.querySelector('.sokany-cf-wrap')){
        document.body.classList.add('sokany-cf-ready');
      }
      return;
    }

    // صفحة اتصل بنا بدون أي فورم: أضف الفورم في بداية المحتوى
    if(!(window.SOKANY_CF111&&SOKANY_CF111.isContact))return;
    var clone=cloneForm();
    if(!clone)return;
    var host=document.querySelector('.entry-content, .site-content, .elementor-widget-theme-post-content, .elementor-section .elementor-container, main, #content, .content-area');
    if(host){host.insertBefore(clone,host.firstChild);}
    else{document.body.insertBefore(clone,document.body.firstChild);}
    var f=clone.querySelector('.sokany-cf-form');
    if(f)bindForm(f);
    document.body.classList.add('sokany-cf-ready');
  }

  function boot(){ensureVisibleForm();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
  setTimeout(ensureVisibleForm,700);
  setTimeout(ensureVisibleForm,1800);
})();
JS;
}
