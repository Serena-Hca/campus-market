// ============================================
// app.js —— 首页逻辑：列表 + 关键词搜索 + 头部登录状态区
// 注意：sb 客户端、getCurrentUser()、signOut() 都在 auth.js 里定义
// ============================================

let currentUser = null; // 页面加载时确定一次登录状态，后续渲染都用它
let itemsById = {}; // id → 物品 的映射，"立即购买"按 id 取物品信息，避免把标题塞进 onclick 引号里出问题
// 分类列表：与 sql/006 的 check 约束保持一致，改动要两边同步改
const CATEGORIES = ["数码电子", "教材书籍", "生活用品", "服饰鞋包", "运动健身", "美妆个护", "宿舍家具", "其他"];
let activeCategory = "全部"; // 当前筛选的分类，"全部" = 不筛选
let allItems = []; // 最近一次拉到的全部物品：分类筛选在本地做，切分类不用再请求数据库

// ---------- 工具函数 ----------

// 把数据库里的 created_at 时间转成「x 分钟前」这样的可读格式
function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return Math.floor(seconds / 60) + " 分钟前";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " 小时前";
  return Math.floor(seconds / 86400) + " 天前";
}

// 转义 HTML，防止用户输入里带 <script> 之类的内容破坏页面
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- 页面头部 ----------

async function renderAuthArea() {
  const area = document.getElementById("auth-area");
  if (currentUser) {
    area.innerHTML = `
      <a href="my.html" class="inbox-btn">📋 我的发布</a>
      <a href="orders.html" class="inbox-btn">📦 订单</a>
      <a href="inbox.html" class="inbox-btn">💬 消息</a>
      <a href="publish.html" class="publish-btn">+ 发布闲置</a>
      <span class="user-email">${escapeHtml(currentUser.email)}</span>
      <a href="#" id="logout-link">退出</a>`;
    document.getElementById("logout-link").onclick = (e) => {
      e.preventDefault();
      signOut();
    };
  } else {
    area.innerHTML = `
      <a href="publish.html" class="publish-btn">+ 发布闲置</a>
      <a href="login.html">登录</a>`;
  }
}

// ---------- 分类筛选条 ----------

// 渲染顶部分类筛选条："全部" + 各分类，点哪个筛哪个
function renderFilterBar() {
  const bar = document.getElementById("filter-bar");
  bar.innerHTML = ["全部", ...CATEGORIES].map((cat) =>
    `<span class="chip${cat === activeCategory ? " active" : ""}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</span>`
  ).join("");
  bar.querySelectorAll(".chip").forEach((chip) => {
    chip.onclick = () => {
      activeCategory = chip.dataset.cat;
      renderFilterBar(); // 刷新高亮
      renderList();      // 本地重新筛选渲染
    };
  });
}

// ---------- 列表与搜索 ----------

async function loadItems(keyword = "") {
  const listEl = document.getElementById("item-list");

  // 登录用户额外查 contact 列（数据库列权限保证：未登录角色根本查不到这列）
  // image_url 两种角色都查：照片已授权 anon 可读（见 sql/003）
  // user_id 登录时查：用来判断"这是不是我自己发的"，自己的物品不显示私聊按钮
  const fields = currentUser
    ? "id, user_id, title, description, price, contact, status, image_url, category, created_at"
    : "id, title, description, price, status, image_url, category, created_at";

  let query = sb.from("items").select(fields).order("created_at", { ascending: false });

  // 关键词搜索：标题或描述里包含即可（ilike = 不区分大小写的模糊匹配）
  if (keyword) {
    const safe = keyword.replace(/[%_]/g, ""); // 去掉 SQL 通配符，防止把别人的数据全匹配出来
    if (safe) {
      query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
  }

  const { data, error } = await query;

  if (error) {
    listEl.innerHTML = `<p class="error">加载失败：${escapeHtml(error.message)}</p>`;
    return;
  }

  // 已售出的沉到列表底部（还在售的优先），同组内按发布时间倒序
  const rank = (it) => (it.status === "sold" ? 1 : 0);
  data.sort((a, b) => rank(a) - rank(b) || new Date(b.created_at) - new Date(a.created_at));
  // 刷新 id → 物品映射，供"立即购买"使用
  itemsById = {};
  data.forEach((it) => { itemsById[it.id] = it; });

  // 缓存全量列表；空列表提示、分类筛选、渲染都交给 renderList
  allItems = data;
  renderList();
}

// 按当前选中的分类筛选并渲染列表（数据已在 allItems 里，纯本地操作，秒响应）
function renderList() {
  const listEl = document.getElementById("item-list");
  const keyword = document.getElementById("search-input").value.trim();
  const data = activeCategory === "全部"
    ? allItems
    : allItems.filter((it) => it.category === activeCategory);

  if (data.length === 0) {
    listEl.innerHTML = (keyword && activeCategory !== "全部")
      ? `<p class="empty">「${escapeHtml(activeCategory)}」分类下没有找到「${escapeHtml(keyword)}」，换个分类或关键词试试？</p>`
      : activeCategory !== "全部"
        ? `<p class="empty">「${escapeHtml(activeCategory)}」分类下暂时没有闲置，换个分类看看？</p>`
        : (keyword
          ? `<p class="empty">没有找到「${escapeHtml(keyword)}」相关的闲置，换个词试试？</p>`
          : `<p class="empty">还没有人发布闲置，来抢沙发～</p>`);
    return;
  }

  // 网格卡片：照片在上、价格在下，已售出的灰化 + 角标
  listEl.innerHTML = data.map((item) => {
    const sold = item.status === "sold";
    const mine = currentUser && item.user_id === currentUser.id;
    let actionsHtml = "";
    if (!currentUser) {
      actionsHtml = `
        ${!sold ? `<a class="buy-btn" href="login.html">🛒 登录后购买</a>` : ""}
        <a class="chat-btn" href="login.html">💬 登录后私聊卖家</a>`;
    } else if (!mine) {
      actionsHtml = `
        ${!sold ? `<button class="buy-btn" onclick="buyItem('${item.id}')">🛒 立即购买</button>` : ""}
        <button class="chat-btn" onclick="startChat('${item.id}')">💬 私聊卖家</button>`;
    }
    return `
    <div class="item-card${sold ? " is-sold" : ""}">
      <div class="item-photo-box">
        ${item.image_url
          ? `<img src="${escapeHtml(item.image_url)}" loading="lazy" alt="${escapeHtml(item.title)}">`
          : `<span class="photo-placeholder">📦</span>`}
        ${sold ? `<span class="sold-overlay">已售出</span>` : ""}
      </div>
      <div class="item-body">
        <div class="title-row">
          <h2>${escapeHtml(item.title)}<span class="cat-tag">${escapeHtml(item.category || "其他")}</span></h2>
        </div>
        <p class="desc">${escapeHtml(item.description)}</p>
        ${currentUser
          ? `<p class="contact">📱 ${escapeHtml(item.contact)}</p>`
          : `<p class="contact"><a href="login.html">登录后查看联系方式</a></p>`}
        <p class="meta">发布于 ${timeAgo(item.created_at)}</p>
        ${actionsHtml ? `<p class="actions">${actionsHtml}</p>` : ""}
      </div>
      <div class="item-foot">
        <span class="price">¥${item.price}</span>
        ${mine ? `<a class="manage-link" href="my.html">✏️ 我的物品 · 去管理</a>` : ""}
      </div>
    </div>`;
  }).join("");
}

// ---------- 首页快捷入口 ----------

// 横幅下方的圆图标导航：登录前后显示不同入口
function renderQuickNav() {
  const nav = document.getElementById("quick-nav");
  if (!nav) return;
  if (!currentUser) {
    nav.innerHTML = `<a href="login.html"><span class="q-icon">🔑</span>登录 / 注册</a>`;
    return;
  }
  nav.innerHTML = `
    <a href="publish.html"><span class="q-icon">📮</span>发布闲置</a>
    <a href="my.html"><span class="q-icon">📋</span>我的发布</a>
    <a href="orders.html"><span class="q-icon">📦</span>我的订单</a>
    <a href="inbox.html"><span class="q-icon">💬</span>消息</a>`;
}

// ---------- 私聊入口 ----------

// 找到（或创建）我和卖家关于这件物品的会话，返回会话 id；失败返回 null
// 规则：同一买家对同一物品只有一场会话（数据库 unique 约束保证）
async function ensureConversation(itemId) {
  // 先找有没有聊过
  const { data: existing, error: findErr } = await sb
    .from("conversations")
    .select("id")
    .eq("item_id", itemId)
    .eq("buyer_id", currentUser.id)
    .maybeSingle();
  if (findErr) {
    alert("发起会话失败：" + findErr.message);
    return null;
  }
  if (existing) return existing.id;
  // 没聊过就新建一场（seller_id 由数据库触发器自动填，见 sql/004）
  const { data: created, error: createErr } = await sb
    .from("conversations")
    .insert({ item_id: itemId, buyer_id: currentUser.id })
    .select("id")
    .single();
  if (createErr) {
    alert("发起会话失败：" + createErr.message);
    return null;
  }
  return created.id;
}

// 点"私聊卖家"：进聊天页
async function startChat(itemId) {
  if (!currentUser) {
    location.href = "login.html";
    return;
  }
  const convId = await ensureConversation(itemId);
  if (convId) location.href = "chat.html?c=" + convId;
}

// ---------- 模拟下单 ----------

// 点"立即购买"：确认 → 下单（数据库触发器负责校验+快照+把物品标记为已售出，见 sql/005）
// → 自动给卖家发一条私聊当作"订单通知" → 跳进聊天页约面交
async function buyItem(itemId) {
  if (!currentUser) {
    location.href = "login.html";
    return;
  }
  const item = itemsById[itemId];
  if (!item) return;
  const ok = confirm(
    `确认以 ¥${item.price} 下单「${item.title}」？\n\n` +
    `这是课程项目的【模拟下单】，不会发生真实付款。\n` +
    `下单后请与卖家私聊，约定时间地点当面交易。`
  );
  if (!ok) return;

  // 只提交物品 id 和买家身份；卖家/标题/价格由数据库触发器现场快照，传了也会被覆盖
  const { data: order, error } = await sb
    .from("orders")
    .insert({ item_id: itemId, buyer_id: currentUser.id })
    .select("id, price")
    .single();

  if (error) {
    // 触发器抛的是可读中文，直接展示；唯一索引撞车说明被抢单
    if (error.message.includes("duplicate key")) {
      alert("手慢了，这件刚刚被别人买走了！");
    } else {
      alert(error.message);
    }
    loadItems(document.getElementById("search-input").value.trim()); // 刷新列表看最新状态
    return;
  }

  // 下单成功 → 自动给卖家发一条私聊（卖家在"💬 消息"里就能看到订单通知）→ 跳进聊天页
  const convId = await ensureConversation(itemId);
  if (convId) {
    await sb.from("messages").insert({
      conversation_id: convId,
      sender_id: currentUser.id,
      content: `我下单了「${item.title}」（模拟支付 ¥${order.price}），我们约个时间地点面交吧！`
    });
    location.href = "chat.html?c=" + convId;
  } else {
    location.href = "orders.html";
  }
}

// ---------- 启动 ----------

async function init() {
  currentUser = await getCurrentUser();
  renderAuthArea();
  renderFilterBar();
  renderQuickNav();
  loadItems();

  // 搜索框：输入即搜。
  // 注意：搜索时自动切回"全部"分类——旧物品的分类都是"其他"，
  // 若停留在某个分类下搜索会被本地筛选误伤，用户会以为"搜索坏了"
  document.getElementById("search-input").addEventListener("input", (e) => {
    activeCategory = "全部";
    renderFilterBar();
    loadItems(e.target.value.trim());
  });
}

init();
