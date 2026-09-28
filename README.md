# fen-dada 的个人网站

网站：https://fen-dada.github.io/

## 上传文章

打开 [管理页面](https://fen-dada.github.io/admin/)，选择 **上传随笔** 或 **上传小说**：

1. 使用 `fen-dada` 账号登录 GitHub。
2. 拖入 Word（`.docx`）、TXT 或 Markdown 文件。
3. 点击 **Commit changes**，选择直接提交到 `main`。
4. 等待网站更新，通常需要一两分钟。

也可以直接打开 [随笔上传](https://github.com/fen-dada/fen-dada.github.io/upload/main/content/essays) 或 [小说上传](https://github.com/fen-dada/fen-dada.github.io/upload/main/content/fiction)。

不需要访问令牌，也不需要另注册后台账号。登录和写入权限由 GitHub 校验。目前仓库只有 `fen-dada` 有写入权限；发布工作流也只允许这个账号触发。访客可以阅读公开仓库，但不能直接发布到你的网站。不要向其他账号授予仓库写入权限。

## Word 与 TXT

文件名会作为文章标题，例如 `一个下午.docx` 的标题就是“一个下午”。日期使用最近一次提交该文件的日期。文件名不变时，文章地址不变。

Word 自动转换为博客排版，保留常见段落、标题、粗体、列表、表格及 PNG/JPEG/GIF/WebP 图片。纸面分页、页眉页脚等不保留。`.doc` 请先另存为 `.docx`。单文件最大 25 MB，长篇建议分章。

上传的原文件保存在公开仓库中。请上传准备公开的版本；本机未发布草稿不要上传。

## 连载小说

创建一个以小说名称命名的文件夹，章节文件名以序号开头：

```text
小说名称/
  01 开篇.docx
  02 第二章.docx
  03 第三章.docx
```

把整个文件夹拖入“上传小说”的 GitHub 页面。小说名、章节目录和上下章链接会自动生成。后续章节可进入对应小说文件夹，选择 **Add file → Upload files** 继续上传。

独立短篇直接上传到小说文件夹，不放入子文件夹。

## 修改和删除

- 修改：将同名新文件上传到原来的文件夹，替换原稿并提交。
- 删除：进入 GitHub 中对应的文件，选择删除并提交。
- 改名会改变文章地址，更新正文时建议保持文件名不变。
- 如果没有更新，查看 [发布状态](https://github.com/fen-dada/fen-dada.github.io/actions/workflows/deploy.yml)。转换失败时旧网站仍然保留，修正文档后重新提交即可。

## Markdown

原有 Markdown 文章继续有效。可用下面的头部信息指定标题、日期和简介：

```markdown
---
title: 文章标题
date: 2026-09-28
summary: 简介，可留空
---

正文。
```

连载章节可指定 `series` 和 `order`；`draft: true` 不生成网页，但源文件依然能在公开仓库中看到。旧编辑器的本机草稿可从 [草稿备份页面](https://fen-dada.github.io/admin/draft-backup.html) 下载，不会被清除。

## 本地维护

需要 Node.js 22 或更高版本：

```sh
npm ci
npm run build
npm run preview
```

浏览器打开 http://127.0.0.1:4173/ 。

文章放在 `content/essays/`、`content/fiction/`；项目列表在 `content/projects.json`；页面样式在 `assets/style.css`；生成逻辑在 `scripts/build.mjs`。`dist/` 是构建产物，不要手动编辑。
