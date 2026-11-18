// ============================================
// login.js —— 登录页逻辑
// 流程：输入校内邮箱 → 发验证码 → 输入验证码（6~10 位，以后台设置为准）→ 登录成功跳回首页
// ============================================

let currentEmail = ""; // 记住邮箱，第二步验证时要用

function showMsg(text, isError = true) {
  const el = document.getElementById("msg");
  el.textContent = text;
  el.className = "msg " + (isError ? "error" : "ok");
}

// 第一步：发送验证码
async function sendCode() {
  const email = document.getElementById("email").value.trim();
  const btn = document.getElementById("btn-send");

  // 平台规则：只允许名单内的校内邮箱（名单见 config.js）
  const domainOk = ALLOWED_EMAIL_DOMAINS.some(d => email.endsWith("@" + d));
  if (!domainOk) {
    showMsg("请使用 @" + ALLOWED_EMAIL_DOMAINS.join(" 或 @") + " 结尾的校内邮箱");
    return;
  }

  btn.disabled = true;
  btn.textContent = "发送中…";
  showMsg("");

  // Supabase Auth 内置功能：往邮箱发 OTP 验证码（位数由后台 Authentication 设置决定，当前为 8 位）
  // shouldCreateUser: true 表示新邮箱自动创建账号（免注册）
  const { error } = await sb.auth.signInWithOtp({
    email: email,
    options: { shouldCreateUser: true }
  });

  if (error) {
    showMsg("发送失败：" + error.message);
    btn.disabled = false;
    btn.textContent = "发送验证码";
    return;
  }

  currentEmail = email;
  document.getElementById("step-code").classList.remove("hidden");
  document.getElementById("code").focus();
  showMsg("验证码已发送到 " + email + "，请查收（记得看垃圾邮件）", false);
  btn.textContent = "重新发送";
  btn.disabled = false;
}

// 第二步：校验验证码
async function verifyCode() {
  const token = document.getElementById("code").value.trim();
  const btn = document.getElementById("btn-verify");

  if (!/^\d{6,10}$/.test(token)) {
    showMsg("验证码是 6~10 位数字，请完整输入邮件里的验证码");
    return;
  }

  btn.disabled = true;
  btn.textContent = "验证中…";

  const { error } = await sb.auth.verifyOtp({
    email: currentEmail,
    token: token,
    type: "email"
  });

  if (error) {
    showMsg("验证失败：" + error.message + "（验证码 1 小时内有效，过期请重新发送）");
    btn.disabled = false;
    btn.textContent = "登录";
    return;
  }

  // 登录成功，跳回首页
  location.href = "index.html";
}
