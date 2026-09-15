/* ============================================================
   拾光 · 公共脚本
   作用：1) 连接 Supabase  2) 公共工具函数  3) 背景特效
   每个页面都按顺序引入：
     <script src="js/supabase.js"></script>   ← 本地 Supabase 库（免国外CDN，防网络卡顿）
     <script src="js/app.js"></script>
   ============================================================ */

/* ---------- 1. Supabase 连接配置 ----------
   publishable key 是专门给前端用的公开钥匙，可以放心放在网页代码里。
   数据安全靠 SQL 里的"行级安全策略(RLS)"保证，而不是靠藏钥匙。 */
const SUPABASE_URL = "https://xukjypmmygivdutxfnoj.supabase.co";
const SUPABASE_KEY = "sb_publishable_8Url38cK_AukZjwVf49-cw_PnmC7NWb";

/* 保险：如果 Supabase 库文件没加载成功（网络波动），
   在页面顶部显示红色提示条，而不是让页面"点了没反应"。 */
if (!window.supabase) {
  addEventListener("DOMContentLoaded", () => {
    const tip = document.createElement("div");
    tip.style.cssText = "position:fixed;top:0;left:0;right:0;background:#E8463A;color:#fff;text-align:center;padding:10px;z-index:999";
    tip.textContent = "网络组件加载失败：请按 Ctrl+F5 强制刷新页面重试";
    document.body.appendChild(tip);
  });
}

/* 注意：这个变量不能取名叫 supabase！
   官方库（js/supabase.js）已经声明了全局变量 var supabase，
   浏览器里再写 const supabase 会报"已被声明"的语法错误，
   导致整个脚本失效（就是之前"点了没反应"的根源）。 */
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- 2. 当前登录用户 ---------- */
async function getUser() {
  const { data } = await db.auth.getUser();
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

/* 图片压缩：把用户选的图片按最长边缩到 maxSide 像素，再转成 jpg。
   好处：上传快、省免费存储（1GB 额度）、别人打开帖子加载也快。 */
function compressImage(file, maxSide = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");   // 用 canvas 重新绘制 = 压缩
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);   // 释放内存里的临时地址
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("图片压缩失败"))),
        "image/jpeg", quality
      );
    };
    img.onerror = () => reject(new Error("图片读取失败"));
    img.src = URL.createObjectURL(file);
  });
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
  await db.auth.signOut();
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

/* ---------- 5. 帖子列表查询（二期：改用数据库视图，一次请求拿全部） ----------
   posts_with_stats 是一张"虚拟表"（视图），数据库已把帖子、作者昵称、
   点赞数、评论数、热度分都算好放进去，前端不再需要发 5 个请求。
   参数：
     userId   - 只看某人的帖子（个人主页用）
     sort     - new 最新 / hot 热度 / likes 点赞最多
     keyword  - 按正文关键词模糊搜索
     ids      - 只看指定的帖子（个人主页"我的收藏"用）
     limit / offset - 分页（配合"加载更多"按钮） */
async function fetchPostList({ userId = null, sort = "new", keyword = "", ids = null, limit = 20, offset = 0 } = {}) {
  let q = db.from("posts_with_stats").select("*");
  if (userId) q = q.eq("user_id", userId);
  if (ids) q = q.in("id", ids);                             // 收藏列表：只查收藏过的帖子
  if (keyword) q = q.ilike("content", "%" + keyword + "%");   // 模糊匹配正文

  // 排序：主排序 + 时间第二排序，保证顺序稳定不抖动
  if (sort === "hot") {
    q = q.order("hot_score", { ascending: false }).order("created_at", { ascending: false });
  } else if (sort === "likes") {
    q = q.order("like_count", { ascending: false }).order("created_at", { ascending: false });
  } else {
    q = q.order("created_at", { ascending: false });
  }

  q = q.range(offset, offset + limit - 1);   // 分页：只取本页范围的记录

  const { data, error } = await q;
  if (error || !data) return [];   // 注意：视图没建好时这里会失败，返回空

  const posts = data;
  const ids = posts.map((p) => p.id);

  // "我"的状态：赞过哪些、收藏过哪些（只查当前这批帖子，用于按钮高亮）
  const me = await getUser();
  const likedSet = new Set();
  const favSet = new Set();
  if (me && ids.length) {
    const { data: myLikes } = await db.from("post_likes").select("post_id").eq("user_id", me.id).in("post_id", ids);
    (myLikes || []).forEach((r) => likedSet.add(String(r.post_id)));
    const { data: myFavs } = await db.from("favorites").select("post_id").eq("user_id", me.id).in("post_id", ids);
    (myFavs || []).forEach((r) => favSet.add(String(r.post_id)));
  }

  App.state.likedSet = likedSet;
  App.state.favSet = favSet;
  App.state.me = me;   // 记住当前用户，卡片渲染时判断"是不是我的帖子"用

  // 缓存：只缓存"最新、无搜索、无过滤、第一页"的列表，登录后打开首页秒显
  if (!userId && !ids && !keyword && sort === "new" && offset === 0) {
    savePostsCache(posts);
  }

  return posts.map((p) => ({
    ...p,
    likeCount: p.like_count,
    commentCount: p.comment_count,
  }));
}

/* ---------- 6. 生成帖子卡片的 HTML（首页 / 个人主页复用） ---------- */
function renderPostCard(p) {
  const liked = App.state.likedSet.has(String(p.id));
  const faved = App.state.favSet.has(String(p.id));
  // 只有自己的帖子才显示"删除"按钮
  const isOwn = App.state.me && App.state.me.id === p.user_id;
  // 有图片才渲染（loading="lazy" 懒加载：滚动到附近才下载，页面更快）
  const imgHtml = p.image_url
    ? `<img class="post-img" src="${esc(p.image_url)}" alt="帖子图片" loading="lazy">`
    : "";
  return `
  <div class="card post-card" id="postCard-${p.id}" onclick="location.href='detail.html?id=${p.id}'">
    <div class="post-head">
      ${avatarHtml(p.username)}
      <div>
        <div class="post-user">${esc(p.username || "未知用户")}</div>
        <div class="post-time">${timeAgo(p.created_at)}</div>
      </div>
    </div>
    <div class="post-content">${esc(p.content)}</div>
    ${imgHtml}
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
      ${isOwn ? `<button class="action-btn del" onclick="event.stopPropagation(); App.deletePost(${p.id})">删除</button>` : ""}
    </div>
  </div>`;
}

/* ---------- 7. 点赞 / 取消点赞 ---------- */
async function toggleLike(postId) {
  const me = await getUser();
  if (!me) { location.href = "login.html"; return; }
  const key = String(postId);
  const adding = !App.state.likedSet.has(key);

  if (adding) {
    // 没赞过 → 插入一条点赞记录
    await db.from("post_likes").insert({ post_id: postId, user_id: me.id });
    App.state.likedSet.add(key);
  } else {
    // 已赞过 → 删掉这条点赞记录（取消点赞）
    await db.from("post_likes").delete().eq("post_id", postId).eq("user_id", me.id);
    App.state.likedSet.delete(key);
  }

  // 提速关键：数字在本地直接 ±1，不再发第 2 个请求去重新统计
  //（原来的写法要点赞、取消都会再等一次网络往返）
  const countEl = document.getElementById("likeCount-" + postId);
  const btnEl = document.getElementById("likeBtn-" + postId);
  if (countEl) countEl.textContent = (parseInt(countEl.textContent) || 0) + (adding ? 1 : -1);
  if (btnEl) btnEl.classList.toggle("active", App.state.likedSet.has(key));
}

/* ---------- 8. 收藏 / 取消收藏 ---------- */
async function toggleFav(postId) {
  const me = await getUser();
  if (!me) { location.href = "login.html"; return; }
  const key = String(postId);

  if (App.state.favSet.has(key)) {
    await db.from("favorites").delete().eq("post_id", postId).eq("user_id", me.id);
    App.state.favSet.delete(key);
    showToast("已取消收藏");
  } else {
    await db.from("favorites").insert({ post_id: postId, user_id: me.id });
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
  const adding = !App.state.commentLikedSet.has(key);

  if (adding) {
    await db.from("comment_likes").insert({ comment_id: commentId, user_id: me.id });
    App.state.commentLikedSet.add(key);
  } else {
    await db.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", me.id);
    App.state.commentLikedSet.delete(key);
  }

  // 同帖子点赞：本地 ±1，省一次网络请求
  const countEl = document.getElementById("clikeCount-" + commentId);
  const btnEl = document.getElementById("clikeBtn-" + commentId);
  if (countEl) countEl.textContent = (parseInt(countEl.textContent) || 0) + (adding ? 1 : -1);
  if (btnEl) btnEl.classList.toggle("active", App.state.commentLikedSet.has(key));
}

/* ---------- 10. 删除帖子（只能删自己的，数据库 RLS 也会拦一道） ---------- */
async function deletePost(postId) {
  const me = await getUser();
  if (!me) { location.href = "login.html"; return false; }
  if (!confirm("确定删除这条动态吗？删除后不可恢复")) return false;

  const { error } = await db
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", me.id);   // 双保险：后端策略同样只允许删自己的
  if (error) { showToast("删除失败：" + error.message); return false; }

  // 把页面上的这张卡片直接移除，不用重新加载整页
  const card = document.getElementById("postCard-" + postId);
  if (card) card.remove();
  showToast("已删除");
  return true;
}

/* ---------- 11. 首页缓存（提速） ----------
   登录成功时预取一次帖子列表存进 localStorage，
   下次打开首页先用缓存立刻渲染，再从服务器拿最新数据覆盖。
   缓存只存"最新/无搜索/第一页"，有效期 10 分钟。 */
const POSTS_CACHE_KEY = "shiguang_post_cache";

function savePostsCache(posts) {
  try {
    localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify({ time: Date.now(), posts }));
  } catch (e) { /* 存储满或隐私模式下失败就忽略 */ }
}

function getPostsCache(maxAge = 10 * 60 * 1000) {
  try {
    const raw = localStorage.getItem(POSTS_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (Date.now() - cache.time > maxAge) return null;   // 过期
    return cache.posts;
  } catch (e) { return null; }
}

/* 登录后调用：后台悄悄把首页数据预取进缓存 */
async function prefetchPosts() {
  try {
    await fetchPostList();   // 默认参数会触发 savePostsCache
  } catch (e) { console.error(e); }
}

/* ---------- 12. 全局状态 + 对外接口 ---------- */
/* 所有页面通过 App.xxx 调用这里的函数 */
const App = {
  db,
  state: { me: null, likedSet: new Set(), favSet: new Set(), commentLikedSet: new Set() },
  getUser, requireLogin, esc, timeAgo, avatarHtml, showToast, logout, compressImage,
  initFx, fetchPostList, renderPostCard, deletePost,
  toggleLike, toggleFav, toggleCommentLike,
  getPostsCache, prefetchPosts,
};
window.App = App;