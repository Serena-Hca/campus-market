// ============================================
// inbox.js —— 消息列表页逻辑
// 显示我参与的所有会话（我买的 + 我卖的），按最新动态排序
// ============================================

let currentUser = null;

// ---------- 工具函数 ----------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return Math.floor(seconds / 60) + " 分钟前";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " 小时前";
  return Math.floor(seconds / 86400) + " 天前";
}

// ---------- 加载会话列表 ----------

async function loadConversations() {
  const listEl = document.getElementById("conv-list");

  // 查"我参与的"会话：同时嵌套物品信息和最近一条消息
  const { data, error } = await sb
    .from("conversations")
    .select("id, buyer_id, seller_id, created_at, items(title, image_url, status), messages(content, created_at)")
    .or(`buyer_id.eq.${currentUser.id},seller_id.eq.${currentUser.id}`)
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" });

  if (error) {
    listEl.innerHTML = `<p class="empty">加载失败：${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML = `<p class="empty">还没有消息。<br>去<a href="index.html">首页</a>挑件闲置，点"私聊卖家"开始第一句吧～</p>`;
    return;
  }

  // 按"最新动态"排序：有消息按最新消息时间，没消息按会话创建时间
  data.sort((a, b) => {
    const ta = a.messages && a.messages.length ? a.messages[0].created_at : a.created_at;
    const tb = b.messages && b.messages.length ? b.messages[0].created_at : b.created_at;
    return new Date(tb) - new Date(ta);
  });

  listEl.innerHTML = data.map(c => {
    const item = c.items || {};
    const isBuyer = c.buyer_id === currentUser.id;
    const last = c.messages && c.messages.length ? c.messages[0] : null;
    const preview = last ? escapeHtml(last.content) : "（还没有消息，点进来打个招呼吧）";
    const time = timeAgo(last ? last.created_at : c.created_at);
    return `
      <a class="conv-card" href="chat.html?c=${c.id}">
        ${item.image_url
          ? `<img src="${escapeHtml(item.image_url)}" alt="物品照片">`
          : `<div class="no-img">📦</div>`}
        <div class="conv-body">
          <div class="conv-top">
            <span class="conv-title">${escapeHtml(item.title || "物品已删除")}${item.status === "sold" ? '<span class="sold-tag">已售出</span>' : ""}<span class="role-tag ${isBuyer ? "role-buy" : "role-sell"}">${isBuyer ? "我买的" : "我卖的"}</span></span>
            <span class="conv-time">${time}</span>
          </div>
          <p class="conv-preview">${preview}</p>
        </div>
      </a>`;
  }).join("");
}

// ---------- 启动 ----------

async function init() {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    alert("登录后才能查看消息");
    location.href = "login.html";
    return;
  }
  loadConversations();
}

init();
