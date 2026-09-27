# fen-dada 的个人博客

网站：**https://fen-dada.github.io/**

简约的中文个人博客，包含项目展示、随笔和小说。纯静态页面，不依赖外部字体或前端框架；手机和电脑都可以阅读。

## 最简单的发布方式：直接在 GitHub 上写

1. 打开本仓库的 `content/essays/` 文件夹。
2. 点击 **Add file → Create new file**，输入文件名，例如 `a-quiet-day.md`。
3. 复制下面的格式，修改标题、日期、简介和正文。
4. 点击 **Commit changes**，提交到 `main` 分支。
5. 等待 **Actions → Publish blog** 变绿，网站便会自动更新。

```markdown
---
title: 一个安静的下午
date: 2026-09-27
summary: 这里填你自己的简介。
draft: false
---

这里写你自己的正文。

## 小标题

新段落之间空一行。
```

这里的文字只是格式示例，不会自动发布到网站。

文件名请用英文或拼音，可以包含数字、连字符、下划线；标题可以用中文。`date` 填作品的实际发布日期，格式为 `YYYY-MM-DD`。未完成的文章可设为 `draft: true`，不生成网页。**仓库是公开的，草稿源文件仍然能被访问；不公开的作品请保留在本地。**

## 小说：短篇和连载

独立短篇放在 `content/fiction/`，格式与随笔相同。

连载的每章各放一个 Markdown 文件，并增加 `series` 和 `order`：

```markdown
---
title: 第一章 · 章节标题
date: 2026-09-27
summary: 这一章的简短介绍。
series: 小说名称
order: 1
draft: false
---

这里写章节正文。
```

同一部小说使用相同的 `series`。`order` 从 1 开始递增且不能重复。网站自动生成书架入口、章节目录、上一章和下一章链接。

可复制的未发布模板保存在 `examples/essay.md` 和 `examples/chapter.md`。只有 `content/essays/`、`content/fiction/` 下的 Markdown 文件会参与生成，示例目录不会发布。

## 修改项目与名称

- `content/projects.json`：项目名称、简介、语言、类别与链接。增删条目会同步更新首页和项目页。
- `site.config.json`：站点名称、网址、介绍和 GitHub 链接。
- `assets/style.css`：颜色、字体、间距及手机适配。
- `scripts/build.mjs`：页面布局与生成逻辑。

当前项目介绍根据对应公开仓库的信息编写。随笔和小说尚未提供，因此初始状态没有公开作品。

## 本地预览

需要 Node.js 22 或更高版本：

```sh
npm ci
npm run build
npm run preview
```

打开 http://127.0.0.1:4173/ 。修改内容后重新运行 `npm run build` 并刷新页面。按 Ctrl+C 停止预览。

## 部署

GitHub Pages 的 Source 使用 **GitHub Actions**。向 `main` 推送后，`.github/workflows/deploy.yml` 会安装依赖、生成 `dist/` 并部署。也可以在 Actions 页面手动运行 **Publish blog**。

`dist/` 是生成目录，构建时会重新生成，不要直接修改；写作内容存放在 `content/`。部署仅上传 `dist/`，不会把 README、示例、依赖或构建脚本作为网页发布。
