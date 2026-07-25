/**
 * Lost-password phone OTP UI for SOKANY WhatsApp OTP plugin.
 */
(function () {
  "use strict";

  var cfg = window.sokanyLostPasswordOtp || {};
  var restBase = (cfg.restBase || "").replace(/\/$/, "");
  var i18n = cfg.i18n || {};

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function show(el, message, isError, html) {
    if (!el) return;
    if (html) {
      el.innerHTML = message || "";
    } else {
      el.textContent = message || "";
    }
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
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

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
    show(
      statusEl,
      text + ' <a href="' + link.replace(/"/g, "&quot;") + '">' + cta + "</a>",
      true,
      true
    );
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
        var data = await postJson(restBase + "/request", {
          phone: phone,
          purpose: "login",
        });

        if (data.ok === false) {
          if (isUserNotFound(data, null)) {
            showNotRegistered(statusEl);
            return;
          }
          throw new Error(data.message || i18n.errorGeneric);
        }

        if (stepCode) stepCode.hidden = false;
        if (codeInput) codeInput.focus();
        show(statusEl, i18n.otpSent || "OTP sent", false);
      } catch (err) {
        if (isUserNotFound(err.payload, err)) {
          showNotRegistered(statusEl);
        } else {
          show(statusEl, err.message || i18n.errorGeneric, true);
        }
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
        var verified = await postJson(restBase + "/verify", {
          phone: phone,
          purpose: "login",
          otp: otp,
        });
        var token = verified.token || "";
        if (!token) {
          throw new Error(i18n.errorGeneric || "Missing token");
        }

        var session = await postJson(restBase + "/lost-password-session", {
          phone: phone,
          token: token,
          nonce: cfg.sessionNonce || "",
        });

        window.location.href = session.redirect || cfg.redirectUrl || "/my-account/";
      } catch (err) {
        if (isUserNotFound(err.payload, err)) {
          showNotRegistered(statusEl);
        } else {
          show(statusEl, err.message || i18n.errorGeneric, true);
        }
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
