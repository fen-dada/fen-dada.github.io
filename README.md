# fen-dada 的个人博客

网站：**https://fen-dada.github.io/**

简约的中文个人博客，包含项目展示、随笔和小说。纯静态页面，不依赖外部字体或前端框架；手机和电脑都可以阅读。

## 网页上传 Word、随笔和小说

打开 **https://fen-dada.github.io/admin/**，或点击博客上的 **写作台**。

1. 点击 **导入文件**，选择 `.docx`。也支持 Markdown 和 TXT。
2. 检查自动导入的标题、正文和图片，选择 **随笔** 或 **小说 / 章节**。
3. 连载小说填写 **小说名称** 和 **章节顺序**；独立短篇留空即可。
4. 点击 **预览** 检查内容，连接 GitHub 后点击 **发布作品**。
5. 等待页面显示 **作品已上线**，即可查看。

Word 会转换成博客的网页排版，保留常见标题、段落、粗体、列表、表格和 PNG/JPEG/GIF/WebP 图片；不会保留分页、页眉页脚等纸面版式。不能识别扫描图片里的文字。原始 Word 文件不会上传，发布的是转换后的正文和图片。特殊图片格式会在导入时提示。

单个导入文件最大 16 MB；转换后的正文与内嵌图片合计应小于 900 KB。图片太大时请压缩图片，长篇作品请按章节分开上传。旧版 `.doc` 需要先用 Word 另存为 `.docx`。

### 首次连接 GitHub

写作台直接与 GitHub 通信，不需要额外服务器。访问令牌由你在 GitHub 上创建：

1. 在写作台点 **连接 GitHub**，再点 **GitHub 创建访问令牌**。
2. **Repository access → Only select repositories**，只选择 **fen-dada.github.io**。
3. **Contents → Read and write**，设置有效期后生成令牌。
4. 将令牌粘贴到写作台并连接。不要把令牌发到聊天、提交到仓库或写进正文。

只允许 `fen-dada` 账号连接。令牌只在当前页面内存中保留，退出或刷新后需要重新粘贴；不会保存到浏览器存储、作品或网站源码。权限不足或令牌过期时页面会给出提示。

### 草稿与修改

- 编辑中的一份草稿自动保存在本机浏览器，不会自动上传。重新打开写作台后可点 **恢复草稿**。清理浏览器数据、换设备或无痕窗口不保留这份草稿；重要作品请点 **下载备份**。
- 已发布的作品会显示在左侧，点击后修改，再点 **发布修改**。原页面地址保持不变。
- 如果作品被其他设备修改，写作台会阻止覆盖，提示先备份当前编辑，再读取新版本。
- 连接和令牌都不是网页入口的隐藏保护：真正的写入权限由 GitHub 校验。访客可以打开写作台，但不能替你发布。

## 另一种发布方式：直接在 GitHub 上写

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
- `scripts/build.mjs`：页面布局、内容安全处理与生成逻辑。
- `admin/`：网页写作台、Word 导入和 GitHub 发布逻辑。

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
