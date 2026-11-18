// ============================================
// chat.js —— 聊天窗口逻辑
// 打开方式：chat.html?c=<会话id>（从首页"私聊卖家"或消息列表进入）
// 机制：加载历史消息 + 每 5 秒轮询新消息（MVP 取舍：不用 WebSocket，
//       新项目实时功能配置复杂，轮询对 5~10 人规模足够快且零配置）
// ============================================

let currentUser = null;
let conversationId = null;
let conversation = null;   // 会话信息（含物品）
let lastRenderKey = "";    // 上次渲染的消息指纹，没变就不重绘，避免闪烁

// ---------- 工具函数 ----------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// 消息时间：今天只显示时分，跨天带上日期
function fmtTime(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return hm;
  return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + hm;
}

// ---------- 加载会话与物品信息 ----------

async function loadConversation() {
  const { data, error } = await sb
    .from("conversations")
    .select("id, item_id, buyer_id, seller_id, items(title, price, image_url, status)")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !data) {
    document.getElementById("messages").innerHTML =
      `<p class="error">会话不存在或你没有权限查看。<br><br><a href="index.html" style="color:#07c160;">回首页</a></p>`;
    document.querySelector(".input-row").style.display = "none";
    document.getElementById("item-bar").style.display = "none";
    return false;
  }

  conversation = data;
  const item = data.items || {};
  const myRole = currentUser.id === data.buyer_id ? "买家" : "卖家";
  document.getElementById("chat-title").textContent =
    "私聊 · 我是" + myRole;

  document.getElementById("item-bar").innerHTML = `
    ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="物品照片">` : ""}
    <div>
      <div class="t">${escapeHtml(item.title || "物品已删除")}${item.status === "sold" ? '<span class="sold-tag">已售出</span>' : ""}</div>
      <div class="p">${item.price != null ? "¥" + item.price : ""}</div>
    </div>`;
  return true;
}

// ---------- 消息加载与渲染 ----------

async function loadMessages() {
  const { data, error } = await sb
    .from("messages")
    .select("id, sender_id, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return; // 轮询失败不打扰用户，等下一轮

  // 指纹没变就不重绘（防止每 5 秒闪一下）
  const key = data ? data.map(m => m.id).join(",") : "";
  if (key === lastRenderKey) return;
  lastRenderKey = key;

  const box = document.getElementById("messages");
  if (!data || data.length === 0) {
    box.innerHTML = `<p class="empty-tip">还没有消息，说第一句吧～<br>（请友善交流，交易尽量约在校园公共场所）</p>`;
    return;
  }

  box.innerHTML = data.map(m => `
    <div class="msg-row ${m.sender_id === currentUser.id ? "me" : ""}">
      <div>
        <div class="bubble">${escapeHtml(m.content)}</div>
        <div class="msg-time">${fmtTime(m.created_at)}</div>
      </div>
    </div>
  `).join("");

  // 滚到最底部看最新消息
  box.scrollTop = box.scrollHeight;
}

// ---------- 发消息 ----------

async function sendMessage() {
  const input = document.getElementById("msg-input");
  const btn = document.getElementById("btn-send");
  const content = input.value.trim();

  if (!content) return;
  if (content.length > 500) {
    alert("一条消息最多 500 字");
    return;
  }

  btn.disabled = true;

  const { error } = await sb.from("messages").insert({
    conversation_id: conversationId,
    sender_id: currentUser.id,
    content: content
  });

  btn.disabled = false;

  if (error) {
    alert("发送失败：" + error.message);
    return;
  }

  input.value = "";
  input.focus();
  await loadMessages(); // 立刻刷新，别等下一轮轮询
}

// ---------- 启动 ----------

async function init() {
  // 1. 必须登录
  currentUser = await getCurrentUser();
  if (!currentUser) {
    alert("登录后才能私聊");
    location.href = "login.html";
    return;
  }

  // 2. 从网址拿会话 id
  conversationId = new URLSearchParams(location.search).get("c");
  if (!conversationId) {
    location.href = "inbox.html";
    return;
  }

  // 3. 加载会话和消息
  const ok = await loadConversation();
  if (!ok) return;
  await loadMessages();

  // 4. 回车发送
  document.getElementById("msg-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // 5. 每 5 秒轮询新消息（页面切到后台时暂停，省流量）
  setInterval(() => {
    if (document.visibilityState === "visible") loadMessages();
  }, 5000);
}

init();
