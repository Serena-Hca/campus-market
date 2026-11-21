// ============================================
// import.js —— AI 回填页：解析发布助手输出的 JSON → 预览校验 → 一键上架
// 注意：sb 客户端、getCurrentUser() 都在 auth.js 里定义
// ============================================

let currentUser = null;
let parsedItem = null; // 最近一次解析成功且通过校验的条目，"确认上架"直接用它

// 分类白名单：与 sql/006 的 check 约束、app.js 的 CATEGORIES 保持一致，改动要三处同步
const CATEGORIES = ["数码电子", "教材书籍", "生活用品", "服饰鞋包", "运动健身", "美妆个护", "宿舍家具", "其他"];

// ---------- 工具函数 ----------

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function setMsg(text) {
  document.getElementById("msg").textContent = text;
}

// 标题字数按"字"算（中文一字一字符），4—30 字
function titleLength(t) {
  return Array.from(String(t ?? "").trim()).length;
}

// ---------- 解析与校验 ----------

function parsePreview() {
  setMsg("");
  parsedItem = null;
  const preview = document.getElementById("preview");
  const btnConfirm = document.getElementById("btn-confirm");
  const reasonsEl = document.getElementById("pv-reasons");

  const raw = document.getElementById("json-input").value.trim();

  // 第 1 关：得是合法 JSON
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    preview.classList.add("hidden");
    setMsg("格式不对，检查是否完整复制");
    return;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    preview.classList.add("hidden");
    setMsg("格式不对，检查是否完整复制");
    return;
  }

  // 第 2 关：字段校验，不通过的原因全部列出来，并禁用"确认上架"
  const reasons = [];

  const title = String(obj.title ?? "").trim();
  const tLen = titleLength(title);
  if (tLen < 4 || tLen > 30) reasons.push(`标题需 4—30 字，当前 ${tLen} 字`);

  const category = String(obj.category ?? "").trim();
  if (!CATEGORIES.includes(category)) reasons.push("分类不在 8 个白名单内，请让发布助手重新判定");

  const price = Number(obj.price);
  if (!Number.isFinite(price) || price <= 0) reasons.push("价格必须是大于 0 的数字");

  // 预览区：通过与否都展示，让用户对照检查
  document.getElementById("pv-title").textContent = title || "（缺）";
  document.getElementById("pv-category").textContent = category || "（缺）";
  document.getElementById("pv-price").textContent = Number.isFinite(price) ? "¥" + price : String(obj.price ?? "（缺）");
  document.getElementById("pv-description").textContent = String(obj.description ?? "").trim() || "（缺）";
  document.getElementById("pv-contact").textContent = String(obj.contact ?? "").trim() || "（缺）";

  reasonsEl.innerHTML = reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("");
  btnConfirm.disabled = reasons.length > 0;

  if (reasons.length === 0) {
    parsedItem = {
      title,
      category,
      price,
      description: String(obj.description ?? "").trim(),
      contact: String(obj.contact ?? "").trim(),
    };
  }
  preview.classList.remove("hidden");
}

// ---------- 确认上架 ----------

async function confirmImport() {
  if (!parsedItem) return;
  const btn = document.getElementById("btn-confirm");
  btn.disabled = true;
  setMsg("");

  // source='agent' 标记这条来自 AI 回填，首页会展示"AI 生成"徽章
  const { error } = await sb.from("items").insert({
    title: parsedItem.title,
    description: parsedItem.description,
    price: parsedItem.price,
    contact: parsedItem.contact,
    category: parsedItem.category,
    status: "active",
    source: "agent",
    user_id: currentUser.id,
  });

  if (error) {
    setMsg("上架失败：" + error.message);
    btn.disabled = false;
    return;
  }
  location.href = "index.html?new=1";
}

// ---------- 启动 ----------

async function init() {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    location.href = "login.html";
    return;
  }
}

init();
