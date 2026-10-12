# INbox 设计实现记录

按用户提供的 Figma 设计交付可操作的本机 demo，保留终端式赛博朋克布局和视觉语言。品牌使用 INbox。

## 设计来源

同一文件 `SLUFInK9wjbyLS1YCvyke0` 的六个页面均已成功读取设计上下文和截图：

| 页面 | Figma |
| --- | --- |
| 总览 | [2:2315](https://www.figma.com/design/SLUFInK9wjbyLS1YCvyke0/Untitled?node-id=2-2315) |
| 全部收藏 | [10:9510](https://www.figma.com/design/SLUFInK9wjbyLS1YCvyke0/Untitled?node-id=10-9510) |
| 主题合集 | [10:9852](https://www.figma.com/design/SLUFInK9wjbyLS1YCvyke0/Untitled?node-id=10-9852) |
| 标签矩阵 | [10:10195](https://www.figma.com/design/SLUFInK9wjbyLS1YCvyke0/Untitled?node-id=10-10195) |
| 阅读队列 | [10:10584](https://www.figma.com/design/SLUFInK9wjbyLS1YCvyke0/Untitled?node-id=10-10584) |
| 内容详情 | [11:1445](https://www.figma.com/design/SLUFInK9wjbyLS1YCvyke0/Untitled?node-id=11-1445) |

Figma 连接已恢复；本轮未写入或修改用户的 Figma 文件。原始上下文保留在 `source-*.jsx`，运行界面采用现有项目的原生 JavaScript、CSS 和 Node.js。

## 视觉

默认背景 `#090c0a`，面板 `#0c110e`，主色 `#8bcf3a`，辅色 `#ffd84a`，文字 `#e8f0e6`。238px 桌面侧栏、细线面板、等宽编号、四格统计、卡片网格、标签密度矩阵和三栏阅读队列沿用原稿。内容页保留主栏原文与右栏批注、归档、相关收藏。

使用原始 Figma SVG 和 PNG，保留 SVG 的固有尺寸和图形。按用户最新要求保留原稿蓝色 `#6e9bff`：原始图标、筛选操作、统计标线、标签节点、P2 优先级及内容页链接/归档信息。文字采用本地 JetBrains Mono、Noto Sans SC 和 Inter。原稿的负向趋势保留红色，仅用于实际负值。

六个页面直接从原始节点生成原生 HTML/CSS，保留布局、层级、间距、尺寸与素材槽位；文字和数量由实际内容替换。没有引入 Tailwind 或 React 运行依赖。

终端设置新增文字大小 100%、115%、130%，默认保持原稿大小，刷新后保留。所有下拉菜单和编辑弹窗采用深色、绿色细线、等宽文字的统一风格；不显示系统原生下拉菜单。

终端设置新增四套预设：绿黄终端、霓虹都市（青/品红）、紫电黄光（紫/黄）、琥珀电路（琥珀/青）。允许修改背景、面板、主色、辅色和文字；默认仍为绿黄组合。

## 功能调整

- 标签每条最多 3 个，全库最多 16 个，AI 优先复用粗粒度标签；支持修改、重命名和合并，保护手动标签。
- AI 配置提供 OpenAI/Codex、DeepSeek、豆包和兼容接口。采用 API Key 模式，实际连接测试成功后才显示通过；没有读取 Codex 登录凭据。
- X 同步中心填写开发者应用配置，进入正式 OAuth 2.0 PKCE 授权。书签分页读取、去重、本机保存，新增内容接入已配置的 AI 整理。
- 内容页完整原文、媒体与链接、标签编辑、批注、阅读状态、主题归档、队列优先级与相邻收藏。
- 所有数量根据载入数据计算；未配置凭据时明确显示示例模式，无虚构的授权成功或 X 原文入口。

## 验证与交付

[本机 demo](http://127.0.0.1:4318/) 已启动，未配置账户时提供 12 条示例、12 个标签、9 条队列。21 项测试及语法检查通过。查询、分页、优先级提交与刷新、模型预设、字号持久化以及字号变化保留表单草稿已在浏览器验证。

1440px、默认 100% 字号下，48 个关键布局节点与 Figma 位置和尺寸一致。六个页面的 164 个可见图片无损坏，SVG 固有尺寸一致。原始模板 156 个素材槽位全部指向本地下载的 111 个源素材。见 [复原审计](REPLICATION_AUDIT.md)。

桌面截图使用 `inbox-faithful-*.jpg`。窄窗口保留原稿桌面布局，可横向滚动；本轮未采用之前的手机重排布局。内容详情保持原稿结构，正文高度随真实文本变化。

真实 AI 和 X 同步仍待用户填写自己的 API Key / X Client ID 并完成授权后验证。该版本是本机单用户 demo，没有公网部署、语义检索、OCR 或线程补全。
