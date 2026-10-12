import { classify } from './catalog.js';

const samples = [
  ['AI 产品经理的第一份作品集', '一份好的作品集，不是把功能截图排成一份 PDF。\n\n从一个具体问题出发：谁遇到了什么困难？现有方法为什么不够好？\n\n记录你怎样定义目标、选择方案、验证效果，以及遇到失败后如何修改。\n\n对于 AI 产品，还要说明评估标准、失败案例与成本取舍。\n\n让别人看见你的判断过程，比罗列工具名称更有说服力。', 'product_notes', 'Product Notes'],
  ['先开始，再慢慢变好。', '别把准备当成进步。做一个很小的版本，才会知道下一步。\n\n不用等到完美，今天先开始十分钟。', 'slow_progress', 'Slow Progress'],
  ['留给下次面试的工具箱', '产品面试题库、案例拆解、简历检查清单。\n\n把资料按你要解决的问题整理，需要的时候，再回来找。', 'career_archive', 'Career Archive'],
  ['给注意力留一块空白', '试着把最费脑的工作放在第一个时间段，关闭干扰，只推进一个问题。\n\n结束后记录你做了什么，再开始下一个时间段。专注不等于坐得久。', 'focus_lab', 'Focus Lab'],
  ['把 AI 评估变成日常实践', '先写出什么叫“好”，再从真实输入中收集失败案例，逐步建立评估集。\n\n记录错误发生的条件，区分需求、数据、模型与交互问题。', 'ai_practice', 'AI Practice'],
  ['一个持续更新的学习书架', '数据分析、产品设计与 AI 入门资料。\n\n给每份资源补上一个用途：它能帮我解决什么问题？按问题检索，减少重复寻找。', 'open_shelf', 'Open Shelf'],
  ['从 Demo 到可靠工作流', 'Agent 的表现需要放进真实工作流里评估。\n\n先覆盖重复任务，再记录异常如何被发现和修正。让用户知道什么时候可以相信结果，什么时候需要接手。', 'workflow_notes', 'Workflow Notes'],
  ['用户反馈是一份长期资产', '产品创新的起点常常是一个反复出现的问题。\n\n不要只统计点击，保留用户怎样继续完成任务的证据。每次迭代只解决一个明确的障碍。', 'product_signals', 'Product Signals'],
  ['做一个足够小的独立产品', '独立开发时，先把一个场景做完整。\n\n一个稳定的入口、清楚的界面和可验证的反馈，比堆叠功能更有帮助。', 'build_small', 'Build Small'],
  ['空间怎样影响我们的注意力', '城市空间与工作环境都会影响专注。\n\n观察动线、光线和信息层级，找到让人更容易开始工作的安排。', 'space_notes', 'Space Notes'],
  ['评测先于提示词优化', '把模型评测作为工作流程的一部分。\n\n固定一组真实问题，记录 Agent 的失败类型，再比较修改前后的结果。不要凭一两个成功案例下结论。', 'eval_notes', 'Eval Notes'],
  ['把资料整理成可用的索引', '知识管理不需要无限细分。\n\n用少量主题概括资源，为每条收藏补上用途。下一次需要时，通过问题检索回来。', 'archive_notes', 'Archive Notes'],
];

export const demoBookmarks = samples.map(([title, text, username, author], i) => ({
  id: `demo-${i + 1}`, title, text, username, author, url: null,
  createdAt: null, importedAt: null, media: [], links: [],
  ...classify(`${title}\n${text}`),
  tags: [['AI产品','产品创新','工作流'],['工作流','增长'],['知识管理','研究'],['界面设计','城市空间','信息架构'],['AI产品','Agent','模型评测'],['知识管理','研究','信息架构'],['AI产品','Agent','工作流'],['AI产品','产品创新','增长'],['独立开发','界面设计','增长'],['城市空间','信息架构','研究'],['模型评测','Agent','工作流'],['产品创新','知识管理','独立开发']][i],
  method: '示例标签',
  category: ['career','inspiration','resources','efficiency','career','resources','career','career','efficiency','inspiration','career','resources'][i],
  demo: true, queue: ![1,5,11].includes(i), priority: [0,2,1,0,1,2,0,1,2,2,2,2][i], read: i === 1 || i === 5,
  readProgress: [36,100,0,68,20,100,0,0,0,0,0,0][i],
  ...(i === 3 ? { media: [{ type: 'photo', url: '/assets/9efb5a93-389c-44a8-a613-0a4f061fbe43.png', alt: '共享空间，设计示例配图' }] } : {}),
  ...(i === 0 ? { note: '记录目标、评估标准与失败案例，留给下次作品集整理。', cover: '/assets/24277522-08ed-42f6-b6ae-2c9d2debffa8.png', links: [{ title: 'AI 模型评估 · API 文档', url: 'https://developers.openai.com/api/docs/guides/evals' }] } : {}),
}));
