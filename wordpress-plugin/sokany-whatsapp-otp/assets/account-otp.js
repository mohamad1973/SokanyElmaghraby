/**
 * My Account OTP login/register UI for SOKANY WhatsApp OTP.
 */
(function () {
  "use strict";

  var cfg = window.sokanyOtpAccount || {};
  var restBase = (cfg.restBase || "").replace(/\/$/, "");
  var i18n = cfg.i18n || {};

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function show(el, message, isError) {
    if (!el) return;
    el.textContent = message || "";
    el.hidden = !message;
    el.classList.toggle("is-error", !!isError);
    el.classList.toggle("is-success", !!message && !isError);
  }

  function setBusy(button, busy) {
    if (!button) return;
    button.disabled = !!busy;
    button.dataset.busy = busy ? "1" : "0";
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
      throw new Error(message);
    }

    return data || {};
  }

  function wireLogin(root) {
    var phoneInput = $(".sokany-otp-phone", root);
    var codeInput = $(".sokany-otp-code", root);
    var requestBtn = $(".sokany-otp-request", root);
    var verifyBtn = $(".sokany-otp-verify", root);
    var statusEl = $(".sokany-otp-status", root);
    var stepCode = $(".sokany-otp-step-code", root);
    var token = "";

    if (!requestBtn || !phoneInput) return;

    requestBtn.addEventListener("click", async function () {
      show(statusEl, "");
      setBusy(requestBtn, true);
      try {
        var data = await postJson(restBase + "/request", {
          phone: phoneInput.value,
          purpose: "login",
        });
        if (data.ok === false) {
          throw new Error(data.message || i18n.errorGeneric);
        }
        if (stepCode) stepCode.hidden = false;
        show(statusEl, i18n.otpSent || "Code sent.", false);
      } catch (err) {
        show(statusEl, err.message || i18n.errorGeneric, true);
      } finally {
        setBusy(requestBtn, false);
      }
    });

    if (!verifyBtn || !codeInput) return;

    verifyBtn.addEventListener("click", async function () {
      show(statusEl, "");
      setBusy(verifyBtn, true);
      try {
        var verified = await postJson(restBase + "/verify", {
          phone: phoneInput.value,
          purpose: "login",
          otp: codeInput.value,
        });
        token = verified.token || "";
        if (!token) {
          throw new Error(i18n.errorGeneric || "Missing token.");
        }

        var session = await postJson(restBase + "/account-session", {
          phone: phoneInput.value,
          token: token,
          purpose: "login",
          nonce: cfg.sessionNonce || "",
        });

        window.location.href = session.redirect || cfg.redirectUrl || "/my-account/";
      } catch (err) {
        show(statusEl, err.message || i18n.errorGeneric, true);
      } finally {
        setBusy(verifyBtn, false);
      }
    });
  }

  function wireRegister(root) {
    var nameInput = $(".sokany-otp-name", root);
    var emailInput = $(".sokany-otp-email", root);
    var phoneInput = $(".sokany-otp-phone", root);
    var passwordInput = $(".sokany-otp-password", root);
    var codeInput = $(".sokany-otp-code", root);
    var requestBtn = $(".sokany-otp-request", root);
    var verifyBtn = $(".sokany-otp-verify", root);
    var statusEl = $(".sokany-otp-status", root);
    var stepCode = $(".sokany-otp-step-code", root);
    var token = "";

    if (!requestBtn || !phoneInput) return;

    requestBtn.addEventListener("click", async function () {
      show(statusEl, "");
      setBusy(requestBtn, true);
      try {
        var data = await postJson(restBase + "/request", {
          phone: phoneInput.value,
          purpose: "register",
        });
        if (data.ok === false) {
          throw new Error(data.message || i18n.errorGeneric);
        }
        if (stepCode) stepCode.hidden = false;
        show(statusEl, i18n.otpSent || "Code sent.", false);
      } catch (err) {
        show(statusEl, err.message || i18n.errorGeneric, true);
      } finally {
        setBusy(requestBtn, false);
      }
    });

    if (!verifyBtn || !codeInput) return;

    verifyBtn.addEventListener("click", async function () {
      show(statusEl, "");
      setBusy(verifyBtn, true);
      try {
        var verified = await postJson(restBase + "/verify", {
          phone: phoneInput.value,
          purpose: "register",
          otp: codeInput.value,
        });
        token = verified.token || "";
        if (!token) {
          throw new Error(i18n.errorGeneric || "Missing token.");
        }

        var session = await postJson(restBase + "/account-session", {
          phone: phoneInput.value,
          token: token,
          purpose: "register",
          nonce: cfg.sessionNonce || "",
          name: nameInput ? nameInput.value : "",
          email: emailInput ? emailInput.value : "",
          password: passwordInput ? passwordInput.value : "",
        });

        window.location.href = session.redirect || cfg.redirectUrl || "/my-account/";
      } catch (err) {
        show(statusEl, err.message || i18n.errorGeneric, true);
      } finally {
        setBusy(verifyBtn, false);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-sokany-otp-login]").forEach(wireLogin);
    document.querySelectorAll("[data-sokany-otp-register]").forEach(wireRegister);
  });
})();
