// ============================================
// my.js —— 我的发布：列出自己发布的物品
// 支持：标记已售出 / 重新上架 / 删除（连带删存储桶照片）
// 权限来自 sql/007：数据库 RLS 策略只允许物主本人改/删（with check 还防止过户给别人）
// ============================================

let currentUser = null;
let myItems = []; // 当前用户的物品列表，删除/改状态时本地取用

function showMsg(html) {
  document.getElementById("my-list").innerHTML = html;
}

async function init() {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    alert("查看我的发布需要先登录");
    location.href = "login.html";
    return;
  }
  document.getElementById("auth-area").innerHTML = `
    <span class="user-email">${currentUser.email}</span>
    <button class="logout-btn" id="btn-logout">退出</button>
  `;
  document.getElementById("btn-logout").addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });
  loadMyItems();
}

async function loadMyItems() {
  showMsg(`<p class="empty">加载中…</p>`);
  // 只查自己的物品（RLS 反正也会拦住别人的，这里明确按 user_id 过滤更清晰）
  const { data, error } = await sb
    .from("items")
    .select("id,title,price,status,category,image_url,created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    showMsg(`<p class="empty">加载失败：${error.message}<br><br>如果提示权限相关错误，请确认已在 SQL Editor 执行 sql/007_my_items.sql</p>`);
    return;
  }

  myItems = data || [];

  if (myItems.length === 0) {
    showMsg(`<p class="empty">你还没有发布闲置<br><a href="publish.html">去发布第一件 →</a></p>`);
    return;
  }

  document.getElementById("my-list").innerHTML = myItems.map((it) => `
    <div class="my-item">
      ${it.image_url ? `<img class="thumb" src="${it.image_url}" alt="">` : `<div class="thumb"></div>`}
      <div class="info">
        <div class="row1">
          <h2>${escapeHtml(it.title)}</h2>
          <span class="cat-tag">${escapeHtml(it.category || "其他")}</span>
          <span class="badge ${it.status}">${it.status === "sold" ? "已售出" : "在售"}</span>
        </div>
        <div class="meta">¥${it.price} · ${timeAgo(it.created_at)}</div>
      </div>
      <div class="actions">
        ${it.status === "active"
          ? `<button class="btn-sold" onclick="markStatus('${it.id}', 'sold')">标记已售出</button>`
          : `<button class="btn-restore" onclick="markStatus('${it.id}', 'active')">重新上架</button>`}
        <button class="btn-delete" onclick="removeItem('${it.id}')">删除</button>
      </div>
    </div>
  `).join("");
}

// 标记已售出 / 重新上架（可逆操作，不用确认）
async function markStatus(id, status) {
  const { error } = await sb.from("items").update({ status: status }).eq("id", id);
  if (error) {
    alert("操作失败：" + error.message);
    return;
  }
  loadMyItems();
}

// 删除物品：确认后先尽力删存储桶照片，再删物品记录
// 已有的订单不会丢（数据库外键 on delete set null，订单快照仍保留）
async function removeItem(id) {
  const item = myItems.find((it) => it.id === id);
  if (!item) return;

  if (!confirm(`确定删除「${item.title}」吗？\n删除后不可恢复；已有的订单记录会保留，但不再关联这件物品。`)) {
    return;
  }

  // 从公开链接反推存储路径（上传时的格式见 publish.js：item-images/<用户id>/<时间戳>.<后缀>）
  if (item.image_url) {
    const marker = "/storage/v1/object/public/item-images/";
    const idx = item.image_url.indexOf(marker);
    if (idx !== -1) {
      const path = item.image_url.slice(idx + marker.length);
      const { error: storageError } = await sb.storage.from("item-images").remove([path]);
      // 照片删失败不阻塞物品删除（003 的存储策略只要求"本人上传的"，正常不会失败）
      if (storageError) console.warn("照片删除失败（不影响物品删除）：", storageError.message);
    }
  }

  const { error } = await sb.from("items").delete().eq("id", id);
  if (error) {
    alert("删除失败：" + error.message);
    return;
  }
  loadMyItems();
}

// ---------- 工具函数（与首页一致） ----------

function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return Math.floor(seconds / 60) + " 分钟前";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " 小时前";
  return Math.floor(seconds / 86400) + " 天前";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
