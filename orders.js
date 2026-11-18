// ============================================
// orders.js —— 订单页：我买的 / 我卖的
// 状态机（由数据库触发器强制，见 sql/005）：
//   已付款(模拟) --买家取消--> 已取消（物品自动重新上架）
//   已付款(模拟) --卖家确认--> 已完成
// ============================================

let currentUser = null;
let ordersById = {}; // id → 订单，点按钮时按 id 取，避免把数据塞进 onclick 引号里

// ---------- 工具函数（与 app.js 同款） ----------

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

// ---------- 渲染 ----------

const STATUS_TEXT = { paid: "已付款(模拟)", completed: "已完成", cancelled: "已取消" };
const STATUS_CLASS = { paid: "st-paid", completed: "st-completed", cancelled: "st-cancelled" };

function actionsHtml(o, role) {
  const parts = [];
  if (role === "buyer" && o.status === "paid") {
    parts.push(`<button class="btn-danger" onclick="cancelOrder('${o.id}')">取消订单</button>`);
  }
  if (role === "seller" && o.status === "paid") {
    parts.push(`<button class="btn-primary" onclick="completeOrder('${o.id}')">✅ 确认完成</button>`);
  }
  parts.push(`<button class="btn-outline" onclick="openChat('${o.id}')">💬 ${role === "buyer" ? "联系卖家" : "联系买家"}</button>`);
  return `<div class="order-actions">${parts.join("")}</div>`;
}

function renderList(elId, orders, role) {
  const el = document.getElementById(elId);
  if (orders.length === 0) {
    el.innerHTML = `<p class="empty">${role === "buyer" ? "还没有买过东西，去首页逛逛～" : "还没有人买你的东西"}</p>`;
    return;
  }
  el.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-head">
        <span class="order-title">${escapeHtml(o.title)}</span>
        <span class="price">¥${o.price}</span>
      </div>
      <div class="order-line">
        <span class="status ${STATUS_CLASS[o.status] || ""}">${STATUS_TEXT[o.status] || escapeHtml(o.status)}</span>
        <span class="time">${timeAgo(o.created_at)}下单</span>
      </div>
      ${actionsHtml(o, role)}
    </div>
  `).join("");
}

async function loadOrders() {
  const { data, error } = await sb
    .from("orders")
    .select("id, item_id, buyer_id, seller_id, title, price, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    document.getElementById("buying-list").innerHTML = `<p class="error">加载失败：${escapeHtml(error.message)}</p>`;
    document.getElementById("selling-list").innerHTML = "";
    return;
  }

  ordersById = {};
  data.forEach(o => { ordersById[o.id] = o; });

  // RLS 已保证只能看到自己参与的订单，这里按角色分成两组
  renderList("buying-list", data.filter(o => o.buyer_id === currentUser.id), "buyer");
  renderList("selling-list", data.filter(o => o.seller_id === currentUser.id), "seller");
}

// ---------- 操作 ----------

// 买家取消订单：物品会被数据库触发器自动重新上架
async function cancelOrder(orderId) {
  if (!confirm("确定取消订单吗？物品会重新上架。")) return;
  const { error } = await sb.from("orders").update({ status: "cancelled" }).eq("id", orderId);
  if (error) {
    alert("取消失败：" + error.message);
    return;
  }
  loadOrders();
}

// 卖家确认交易完成
async function completeOrder(orderId) {
  if (!confirm("确认本次交易已完成？（确认后不可再变更）")) return;
  const { error } = await sb.from("orders").update({ status: "completed" }).eq("id", orderId);
  if (error) {
    alert("操作失败：" + error.message);
    return;
  }
  loadOrders();
}

// 跳到这笔订单对应的聊天（下单时已自动建过会话）
async function openChat(orderId) {
  const o = ordersById[orderId];
  if (!o) return;
  if (!o.item_id) {
    alert("原帖已被删除，找不到聊天入口了");
    return;
  }
  const { data, error } = await sb
    .from("conversations")
    .select("id")
    .eq("item_id", o.item_id)
    .eq("buyer_id", o.buyer_id)
    .maybeSingle();
  if (error || !data) {
    alert("还没有聊过这件物品，去首页点「私聊卖家」发起对话");
    return;
  }
  location.href = "chat.html?c=" + data.id;
}

// ---------- 启动 ----------

async function init() {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    location.href = "login.html";
    return;
  }
  loadOrders();
}

init();
