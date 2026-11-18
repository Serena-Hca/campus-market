// ============================================
// auth.js —— 登录相关公共代码
// 每个页面都引用它（在 config.js 之后引用）
// ============================================

// 创建 Supabase 客户端
// 变量名用 sb：库文件 lib/supabase.js 已经占用了全局变量名 supabase，重名会直接报错
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 获取当前登录用户；未登录返回 null
// supabase-js 会自动把登录态存在浏览器 localStorage 里，刷新页面不丢
async function getCurrentUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

// 退出登录并刷新页面
async function signOut() {
  await sb.auth.signOut();
  location.reload();
}
