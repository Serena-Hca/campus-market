// ============================================
// publish.js —— 发布页逻辑
// 流程：检查登录态（未登录跳登录页）→ 填表（可选传照片）→ 校验
//       → 有照片先压缩上传存储桶 → 写入 items 表 → 跳回首页
// ============================================

let currentUser = null;

function showMsg(text) {
  document.getElementById("msg").textContent = text;
}

// 页面加载时先检查登录状态
async function init() {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    alert("发布闲置需要先登录");
    location.href = "login.html";
  }
}

// ---------- 照片：预览 → 压缩 → 上传 ----------

// 选中照片后立刻在页面上预览
function onPhotoChosen(e) {
  const file = e.target.files[0];
  const preview = document.getElementById("photo-preview");
  if (!file) {
    preview.classList.add("hidden");
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.classList.remove("hidden");
}

// 上传前把照片压到最长边 1200px、JPEG 80% 质量：
// 手机原图常 3~8MB，压缩后通常 200KB 左右，上传快、首页加载也快
function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const max = 1200;
      // 图已经够小就不压，直接用原图
      if (img.width <= max && img.height <= max && file.size < 300 * 1024) {
        return resolve(file);
      }
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.8);
    };
    img.onerror = () => resolve(file); // 压缩失败就用原图兜底
    img.src = URL.createObjectURL(file);
  });
}

// 压缩后上传到 item-images 存储桶，返回公开访问链接
async function uploadPhoto(file) {
  const blob = await compressImage(file);
  const ext = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "jpg");
  // 路径带上用户 id，方便管理也避免重名撞车
  const path = currentUser.id + "/" + Date.now() + "." + ext;
  const { error } = await sb.storage.from("item-images").upload(path, blob, {
    contentType: blob.type || "image/jpeg"
  });
  if (error) throw error;
  const { data } = sb.storage.from("item-images").getPublicUrl(path);
  return data.publicUrl;
}

async function submitItem() {
  const title = document.getElementById("title").value.trim();
  const category = document.getElementById("category").value;
  const description = document.getElementById("description").value.trim();
  const priceRaw = document.getElementById("price").value.trim();
  const contact = document.getElementById("contact").value.trim();
  const btn = document.getElementById("btn-submit");

  // 前端校验（数据库里还有一层 check 约束兜底）
  if (!title) return showMsg("请填写标题");
  if (!category) return showMsg("请选择分类");
  if (!description) return showMsg("请填写描述");
  if (priceRaw === "" || isNaN(Number(priceRaw)) || Number(priceRaw) < 0) {
    return showMsg("请填写正确的价格（不能为负数）");
  }
  if (!contact) return showMsg("请填写联系方式");

  btn.disabled = true;
  showMsg("");

  // 选了照片就先传照片（失败则中止发布，让用户重试或去掉照片）
  let imageUrl = null;
  const photoFile = document.getElementById("photo").files[0];
  if (photoFile) {
    btn.textContent = "上传照片中…";
    try {
      imageUrl = await uploadPhoto(photoFile);
    } catch (e) {
      showMsg("照片上传失败：" + e.message + "（可重试，或去掉照片再发）");
      btn.disabled = false;
      btn.textContent = "发布";
      return;
    }
  }

  btn.textContent = "发布中…";

  const { error } = await sb.from("items").insert({
    user_id: currentUser.id,   // 数据库策略会校验：只能以自己的身份发布
    title: title,
    category: category,        // 发布时选择的分类（数据库 check 约束还有一层兜底校验）
    description: description,
    price: Number(priceRaw),
    contact: contact,
    image_url: imageUrl        // 没选照片就是 null，允许为空
  });

  if (error) {
    showMsg("发布失败：" + error.message);
    btn.disabled = false;
    btn.textContent = "发布";
    return;
  }

  // 发布成功，回首页看自己的信息
  location.href = "index.html";
}

// 选中照片立刻预览
document.getElementById("photo").addEventListener("change", onPhotoChosen);

init();
