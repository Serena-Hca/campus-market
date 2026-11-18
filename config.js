// ============================================
// Supabase 配置
// 位置：Supabase Dashboard → Project Settings → API Keys
// 把下面第二个值换成你的 anon public key 即可
// ============================================

const SUPABASE_URL = "https://awhkpaaqyakjjtvevgzy.supabase.co";

// publishable key（新版 anon key），设计为公开的前端密钥，可以安全写在这里
// 注意：千万不要在这里使用 secret key / service_role key
const SUPABASE_ANON_KEY = "sb_publishable_MrAt8Ief6sCCHiPIDHuSZg_KFDEREXR";

// 允许登录的邮箱后缀列表：只有这些后缀的邮箱才能接收验证码登录
// 正式规则：只允许 "@tju.edu.cn"（天津大学）校内邮箱
// 2026-11-18 部署上线：已删除测试用的临时 "qq.com" 后缀
const ALLOWED_EMAIL_DOMAINS = ["tju.edu.cn"];
