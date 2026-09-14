-- ============================================================
-- 拾光 · Supabase 数据库初始化脚本
-- 使用方法：打开你的 Supabase 项目 → SQL Editor（SQL 编辑器）
--          → 新建查询 → 全选粘贴本文件内容 → 点 Run
-- 可以重复执行，不会报错（表已存在会跳过，策略会重建）
-- ============================================================

-- ==================== 一、建 7 张表 ====================

-- 1. 用户资料表（新用户注册时由触发器自动创建一行）
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null,              -- 昵称
  bio        text default '',            -- 个人简介
  avatar_url text,                       -- 头像图片地址（二期用）
  created_at timestamptz default now()
);

-- 2. 帖子表（一期的帖子只有文字，image_url 和 topic 留给二期）
create table if not exists public.posts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  content    text not null,              -- 正文
  image_url  text,                       -- 图片地址（二期）
  topic      text,                       -- 话题标签（二期）
  created_at timestamptz default now()
);

-- 3. 评论表
create table if not exists public.comments (
  id         bigint generated always as identity primary key,
  post_id    bigint not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  content    text not null,
  created_at timestamptz default now()
);

-- 4. 帖子点赞表（主键 = 帖子 + 用户，天然防止同一个人重复点赞）
create table if not exists public.post_likes (
  post_id    bigint not null references public.posts (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

-- 5. 评论点赞表（原理同上）
create table if not exists public.comment_likes (
  comment_id bigint not null references public.comments (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  created_at timestamptz default now(),
  primary key (comment_id, user_id)
);

-- 6. 收藏夹表（二期：用户可以自建多个命名收藏夹分类收纳）
create table if not exists public.favorite_folders (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null,              -- 收藏夹名，如"旅行""美食"
  created_at timestamptz default now()
);

-- 7. 收藏记录表（folder_id 为空 = 还没分类，先放进"默认收藏"）
create table if not exists public.favorites (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    bigint not null references public.posts (id) on delete cascade,
  folder_id  bigint references public.favorite_folders (id) on delete set null,
  created_at timestamptz default now()
);

-- ==================== 二、注册时自动建资料 ====================
-- auth.users 表每次有人注册会插入一行，触发器顺手在 profiles 也插一行，
-- 昵称先用 "用户_xxxxxx"（id 前 6 位），之后可在个人主页修改。

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, '用户_' || substr(replace(new.id::text, '-', ''), 1, 6));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==================== 三、开启行级安全（RLS）====================
-- 开启 RLS 后，默认谁都不能读写，必须靠下面的"策略"一条条放行。
-- 这就是"未登录不能发帖 / 只能改自己的数据"的实现原理。

alter table public.profiles         enable row level security;
alter table public.posts            enable row level security;
alter table public.comments         enable row level security;
alter table public.post_likes       enable row level security;
alter table public.comment_likes    enable row level security;
alter table public.favorite_folders enable row level security;
alter table public.favorites        enable row level security;

-- ==================== 四、读写策略 ====================
-- 每条策略一句话解释：
--   针对某表，对 select/insert/update/delete 哪种操作，
--   using(...) 判断"哪些已有行可以操作"，with check(...) 判断"新写入的行必须满足"。

-- profiles：公开可读；只能改自己
drop policy if exists "profiles 公开可读" on public.profiles;
create policy "profiles 公开可读" on public.profiles for select using (true);
drop policy if exists "profiles 本人可更新" on public.profiles;
create policy "profiles 本人可更新" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- posts：公开可读；登录可发；只能改/删自己的
drop policy if exists "posts 公开可读" on public.posts;
create policy "posts 公开可读" on public.posts for select using (true);
drop policy if exists "posts 登录可发布" on public.posts;
create policy "posts 登录可发布" on public.posts
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "posts 本人可修改" on public.posts;
create policy "posts 本人可修改" on public.posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "posts 本人可删除" on public.posts;
create policy "posts 本人可删除" on public.posts
  for delete using (auth.uid() = user_id);

-- comments：公开可读；登录可评论；只能删自己的
drop policy if exists "comments 公开可读" on public.comments;
create policy "comments 公开可读" on public.comments for select using (true);
drop policy if exists "comments 登录可评论" on public.comments;
create policy "comments 登录可评论" on public.comments
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "comments 本人可删除" on public.comments;
create policy "comments 本人可删除" on public.comments
  for delete using (auth.uid() = user_id);

-- post_likes：公开可读；登录可点赞；只能取消自己的赞
drop policy if exists "post_likes 公开可读" on public.post_likes;
create policy "post_likes 公开可读" on public.post_likes for select using (true);
drop policy if exists "post_likes 登录可点赞" on public.post_likes;
create policy "post_likes 登录可点赞" on public.post_likes
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "post_likes 本人可取消" on public.post_likes;
create policy "post_likes 本人可取消" on public.post_likes
  for delete using (auth.uid() = user_id);

-- comment_likes：同上
drop policy if exists "comment_likes 公开可读" on public.comment_likes;
create policy "comment_likes 公开可读" on public.comment_likes for select using (true);
drop policy if exists "comment_likes 登录可点赞" on public.comment_likes;
create policy "comment_likes 登录可点赞" on public.comment_likes
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "comment_likes 本人可取消" on public.comment_likes;
create policy "comment_likes 本人可取消" on public.comment_likes
  for delete using (auth.uid() = user_id);

-- favorite_folders：只有本人能看自己的收藏夹
drop policy if exists "folders 本人可读" on public.favorite_folders;
create policy "folders 本人可读" on public.favorite_folders
  for select using (auth.uid() = user_id);
drop policy if exists "folders 本人可建" on public.favorite_folders;
create policy "folders 本人可建" on public.favorite_folders
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "folders 本人可删除" on public.favorite_folders;
create policy "folders 本人可删除" on public.favorite_folders
  for delete using (auth.uid() = user_id);

-- favorites：只有本人能看自己的收藏
drop policy if exists "favorites 本人可读" on public.favorites;
create policy "favorites 本人可读" on public.favorites
  for select using (auth.uid() = user_id);
drop policy if exists "favorites 登录可收藏" on public.favorites;
create policy "favorites 登录可收藏" on public.favorites
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "favorites 本人可取消" on public.favorites;
create policy "favorites 本人可取消" on public.favorites
  for delete using (auth.uid() = user_id);

-- ==================== 五、图片存储桶（二期上传图片用，先建好）====================

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- 图片所有人可看，登录用户可上传
drop policy if exists "图片公开可读" on storage.objects;
create policy "图片公开可读" on storage.objects
  for select using (bucket_id = 'images');
drop policy if exists "登录可上传图片" on storage.objects;
create policy "登录可上传图片" on storage.objects
  for insert to authenticated with check (bucket_id = 'images');

-- ==================== 完成！====================
-- 验证方法：左侧菜单 Table Editor 里应能看到 7 张表；
-- Storage 里能看到 images 桶。

-- ==================== 六、二期：帖子统计视图 ====================
-- 把"帖子 + 作者昵称 + 点赞数 + 评论数"合成一张虚拟表 posts_with_stats，
-- 前端只需 1 次请求就能拿到全部数据（替代原来 5 次串行请求，首页提速），
-- 还支持直接按热度 / 点赞数排序。
-- 热度公式：点赞数 × 2 + 评论数 × 3（想调整权重改这里的数字即可）。

create or replace view public.posts_with_stats as
select
  p.id,
  p.user_id,
  p.content,
  p.image_url,
  p.created_at,
  pr.username,
  coalesce(l.like_count, 0)::bigint      as like_count,
  coalesce(c.comment_count, 0)::bigint   as comment_count,
  (coalesce(l.like_count, 0) * 2 + coalesce(c.comment_count, 0) * 3)::bigint as hot_score
from public.posts p
join public.profiles pr on pr.id = p.user_id
left join (
  select post_id, count(*) as like_count from public.post_likes group by post_id
) l on l.post_id = p.id
left join (
  select post_id, count(*) as comment_count from public.comments group by post_id
) c on c.post_id = p.id;

-- 视图同样要授权给匿名访客和登录用户读取
grant select on public.posts_with_stats to anon, authenticated;