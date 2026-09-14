/* ============================================================
   拾光 · 公共脚本
   作用：1) 连接 Supabase  2) 公共工具函数  3) 背景特效
   每个页面都按顺序引入：
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="js/app.js"></script>
   ============================================================ */

/* ---------- 1. Supabase 连接配置 ----------
   publishable key 是专门给前端用的公开钥匙，可以放心放在网页代码里。
   数据安全靠 SQL 里的"行级安全策略(RLS)"保证，而不是靠藏钥匙。 */
const SUPABASE_URL = "https://xukjypmmygivdutxfnoj.supabase.co";
const SUPABASE_KEY = "sb_publishable_8Url38cK_AukZjwVf49-cw_PnmC7NWb";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- 2. 当前登录用户 ---------- */
async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user || null;   // 未登录返回 null
}

/* 页面要求必须登录才能用（发布页等），否则跳去登录页 */
async function requireLogin() {
  const user = await getUser();
  if (!user) {
    location.href = "login.html";
    return null;
  }
  return user;
}

/* ---------- 3. 工具函数 ---------- */

/* 转义 HTML 特殊字符：防止用户输入 <script> 之类的代码破坏页面 */
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* 把数据库时间格式 "2026-09-14T10:30:00+00:00" 显示成 "3 分钟前 / 昨天 10:30" */
function timeAgo(t) {
  const diff = (Date.now() - new Date(t).getTime()) / 1000; // 相差秒数
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
  if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
  if (diff < 172800) return "昨天";
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/* 生成头像：取名字第一个字 + 自动配色（用名字哈希选颜色） */
const AVATAR_COLORS = ["#F0815C", "#35BFA6", "#6C8CE0", "#E0A245", "#B07CD6", "#5DB56C"];
function avatarHtml(name, large = false) {
  const n = String(name || "?");
  const color = AVATAR_COLORS[n.charCodeAt(0) % AVATAR_COLORS.length];
  const cls = large ? "avatar large" : "avatar";
  return `<div class="${cls}" style="background:${color}">${esc(n.charAt(0))}</div>`;
}

/* 屏幕顶部的小提示条，2 秒后自动消失 */
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
}

/* 退出登录 */
async function logout() {
  await supabase.auth.signOut();
  location.href = "index.html";
}

/* ---------- 4. 背景特效：气泡 + 鼠标光斑 ---------- */
function initFx() {
  /* 4.1 随机生成 12 个气泡，颜色、大小、速度都随机 */
  const colors = ["#F0815C", "#35BFA6", "#F5B971", "#D98FB0", "#8FA8E8"];
  for (let i = 0; i < 12; i++) {
    const b = document.createElement("div");
    b.className = "bubble";
    const size = 20 + Math.random() * 50;           // 直径 20~70px
    b.style.width = size + "px";
    b.style.height = size + "px";
    b.style.left = Math.random() * 100 + "vw";       // 随机横向位置
    b.style.background = colors[Math.floor(Math.random() * colors.length)];
    b.style.animationDuration = 12 + Math.random() * 18 + "s"; // 12~30秒飘完
    b.style.animationDelay = -Math.random() * 20 + "s";        // 负延迟：页面一打开就有泡泡在半空
    document.body.appendChild(b);
  }

  /* 4.2 跟随鼠标的柔光斑（用 requestAnimationFrame 平滑移动） */
  const glow = document.createElement("div");
  glow.id = "glow";
  document.body.appendChild(glow);
  let tx = innerWidth / 2, ty = innerHeight / 2;   // 目标位置
  let gx = tx, gy = ty;                            // 当前实际位置（慢慢追过去）
  addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; });
  (function follow() {
    gx += (tx - gx) * 0.08;   // 每次靠近 8%，形成"慢半拍"的跟随感
    gy += (ty - gy) * 0.08;
    glow.style.left = gx + "px";
    glow.style.top = gy + "px";
    requestAnimationFrame(follow);
  })();
}

/* ---------- 5. 帖子列表：查询 + 点赞/评论数统计 ----------
   首页和个人主页都用这个函数。
   第 1 步查帖子（顺便用外键联表查出作者用户名）
   第 2 步统计每篇帖子的点赞数、评论数
   第 3 步查出"我"点过赞 / 收藏过哪些（用于按钮高亮） */
async function fetchPostList({ userId = null, limit = 50 } = {}) {
  let q = supabase
    .from("posts")
    .select("id, content, created_at, user_id, profiles(username)");
  if (userId) q = q.eq("user_id", userId);         // 只看某人的帖子（个人主页用）
  q = q.order("created_at", { ascending: false }).limit(limit);

  const { data: posts, error } = await q;
  if (error || !posts || posts.length === 0) return [];

  const ids = posts.map((p) => p.id);

  // 统计点赞数：一次查回所有相关行，在 JS 里数
  const { data: likes } = await supabase.from("post_likes").select("post_id").in("post_id", ids);
  const likeCount = {};
  (likes || []).forEach((r) => (likeCount[r.post_id] = (likeCount[r.post_id] || 0) + 1));

  // 统计评论数
  const { data: comments } = await supabase.from("comments").select("post_id").in("post_id", ids);
  const commentCount = {};
  (comments || []).forEach((r) => (commentCount[r.post_id] = (commentCount[r.post_id] || 0) + 1));

  // "我"的状态：赞过哪些、收藏过哪些
  const me = await getUser();
  const likedSet = new Set();
  const favSet = new Set();
  if (me) {
    const { data: myLikes } = await supabase.from("post_likes").select("post_id").eq("user_id", me.id).in("post_id", ids);
    (myLikes || []).forEach((r) => likedSet.add(String(r.post_id)));
    const { data: myFavs } = await supabase.from("favorites").select("post_id").eq("user_id", me.id).in("post_id", ids);
    (myFavs || []).forEach((r) => favSet.add(String(r.post_id)));
  }

  // 把集合存起来，点赞/收藏按钮切换时要用
  App.state.likedSet = likedSet;
  App.state.favSet = favSet;

  return posts.map((p) => ({
    ...p,
    likeCount: likeCount[p.id] || 0,
    commentCount: commentCount[p.id] || 0,
  }));
}

/* ---------- 6. 生成帖子卡片的 HTML（首页 / 个人主页复用） ---------- */
function renderPostCard(p) {
  const liked = App.state.likedSet.has(String(p.id));
  const faved = App.state.favSet.has(String(p.id));
  return `
  <div class="card post-card" onclick="location.href='detail.html?id=${p.id}'">
    <div class="post-head">
      ${avatarHtml(p.profiles?.username)}
      <div>
        <div class="post-user">${esc(p.profiles?.username || "未知用户")}</div>
        <div class="post-time">${timeAgo(p.created_at)}</div>
      </div>
    </div>
    <div class="post-content">${esc(p.content)}</div>
    <div class="post-actions">
      <button class="action-btn ${liked ? "active" : ""}" id="likeBtn-${p.id}"
              onclick="event.stopPropagation(); App.toggleLike(${p.id})">
        点赞 <span id="likeCount-${p.id}">${p.likeCount}</span>
      </button>
      <button class="action-btn ${faved ? "active" : ""}" id="favBtn-${p.id}"
              onclick="event.stopPropagation(); App.toggleFav(${p.id})">
        收藏
      </button>
      <span class="muted">评论 ${p.commentCount}</span>
    </div>
  </div>`;
}

/* ---------- 7. 点赞 / 取消点赞 ---------- */
async function toggleLike(postId) {
  const me = await getUser();
  if (!me) { location.href = "login.html"; return; }
  const key = String(postId);

  if (App.state.likedSet.has(key)) {
    // 已赞过 → 删掉这条点赞记录（取消点赞）
    await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", me.id);
    App.state.likedSet.delete(key);
  } else {
    // 没赞过 → 插入一条点赞记录
    await supabase.from("post_likes").insert({ post_id: postId, user_id: me.id });
    App.state.likedSet.add(key);
  }
  await refreshLikeUI(postId);
}

/* 重新查询点赞总数，并更新按钮样式（红色高亮 = 已赞） */
async function refreshLikeUI(postId) {
  const countEl = document.getElementById("likeCount-" + postId);
  const btnEl = document.getElementById("likeBtn-" + postId);
  if (!countEl || !btnEl) return;
  const { count } = await supabase
    .from("post_likes")
    .select("*", { count: "exact", head: true })   // 只取总数，不取数据
    .eq("post_id", postId);
  countEl.textContent = count ?? 0;
  btnEl.classList.toggle("active", App.state.likedSet.has(String(postId)));
}

/* ---------- 8. 收藏 / 取消收藏 ---------- */
async function toggleFav(postId) {
  const me = await getUser();
  if (!me) { location.href = "login.html"; return; }
  const key = String(postId);

  if (App.state.favSet.has(key)) {
    await supabase.from("favorites").delete().eq("post_id", postId).eq("user_id", me.id);
    App.state.favSet.delete(key);
    showToast("已取消收藏");
  } else {
    await supabase.from("favorites").insert({ post_id: postId, user_id: me.id });
    App.state.favSet.add(key);
    showToast("收藏成功");
  }
  const btnEl = document.getElementById("favBtn-" + postId);
  if (btnEl) btnEl.classList.toggle("active", App.state.favSet.has(key));
}

/* ---------- 9. 评论点赞 / 取消（帖子详情页用） ---------- */
async function toggleCommentLike(commentId) {
  const me = await getUser();
  if (!me) { location.href = "login.html"; return; }
  const key = String(commentId);

  if (App.state.commentLikedSet.has(key)) {
    await supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", me.id);
    App.state.commentLikedSet.delete(key);
  } else {
    await supabase.from("comment_likes").insert({ comment_id: commentId, user_id: me.id });
    App.state.commentLikedSet.add(key);
  }
  const { count } = await supabase
    .from("comment_likes")
    .select("*", { count: "exact", head: true })
    .eq("comment_id", commentId);
  const countEl = document.getElementById("clikeCount-" + commentId);
  const btnEl = document.getElementById("clikeBtn-" + commentId);
  if (countEl) countEl.textContent = count ?? 0;
  if (btnEl) btnEl.classList.toggle("active", App.state.commentLikedSet.has(key));
}

/* ---------- 10. 全局状态 + 对外接口 ---------- */
/* 所有页面通过 App.xxx 调用这里的函数 */
const App = {
  supabase,
  state: { likedSet: new Set(), favSet: new Set(), commentLikedSet: new Set() },
  getUser, requireLogin, esc, timeAgo, avatarHtml, showToast, logout,
  initFx, fetchPostList, renderPostCard,
  toggleLike, toggleFav, toggleCommentLike,
};
window.App = App;