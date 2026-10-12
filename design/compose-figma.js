const state={"createdNodeIds":["2:23","2:24","2:25","2:26","2:27","2:28","2:29","2:30","2:31","2:32","2:33","2:34"],"mutatedNodeIds":["0:1"],"roots":[{"id":"2:23","sidebar":"2:24","main":"2:25","name":"01 收藏库 / Archive"},{"id":"2:26","sidebar":"2:27","main":"2:28","name":"02 搜索 / Find"},{"id":"2:29","sidebar":"2:30","main":"2:31","name":"03 原帖详情 / Read"},{"id":"2:32","sidebar":"2:33","main":"2:34","name":"04 连接与同步 / Sync"}],"variables":{"paper":"VariableID:2:4","surface":"VariableID:2:6","ink":"VariableID:2:8","muted":"VariableID:2:10","line":"VariableID:2:12"},"space":[{"id":"VariableID:15bb1c0f339146e931cf0dc15f89ed57dcbd907e/564:255","name":"Space/200"},{"id":"VariableID:16bc6f84b6e7e20e4234ef79030ee580ec0f4505/564:258","name":"Space/400"},{"id":"VariableID:be3115966ea99eef888c9f25751b54695c7e88d2/564:260","name":"Space/600"}],"styles":{"Body":"S:7984cd0bfe5a8aa61268369fd85e8bf70fa900a8,","Label":"S:195f55105b19186c5732a76c9a6eb2eb9b90fb59,","Display":"S:5beac989d02e2503fd063c094edaa4e5e8354f48,","Title":"S:07791ca6588bb35f6729a6197f2536b44dec1a87,","Mono":"S:416f06924fed51a4890b4edc7791bc2592a6f7f6,","Brand":"S:51fb8aefc49f5b154ac4978f7db12dd3b1fa9f31,"},"collection":"VariableCollectionId:2:2"};
const page=await figma.getNodeByIdAsync("0:1");await figma.setCurrentPageAsync(page);
const ids=[],mutated=[],refs={};
const fonts=[{family:"Noto Sans SC",style:"Regular"},{family:"Noto Sans SC",style:"Medium"},{family:"Noto Serif SC",style:"Regular"},{family:"Space Grotesk",style:"Medium"},{family:"IBM Plex Mono",style:"Regular"}];
await Promise.all(fonts.map(f=>figma.loadFontAsync(f)));
const vars={};for(const [k,id]of Object.entries(state.variables))vars[k]=await figma.variables.getVariableByIdAsync(id);
const spaces=await Promise.all(state.space.map(v=>figma.variables.getVariableByIdAsync(v.id)));
const paint=k=>figma.variables.setBoundVariableForPaint({type:"SOLID",color:{r:0,g:0,b:0}},"color",vars[k]);
function remember(n){ids.push(n.id);return n;}
function stack(parent,name,w,gap=16,dir="VERTICAL",fill=null){
 const n=remember(figma.createAutoLayout(dir));n.name=name;if(parent)parent.appendChild(n);n.resize(w,40);n.primaryAxisSizingMode="AUTO";n.counterAxisSizingMode="FIXED";n.itemSpacing=gap;n.fills=fill?[paint(fill)]:[];
 if(gap===8||gap===16||gap===24)n.setBoundVariable("itemSpacing",spaces[[8,16,24].indexOf(gap)]);return n;
}
async function text(parent,name,value,style="Body",w=null,color="ink"){
 const n=remember(figma.createText());parent.appendChild(n);n.name=name;await n.setTextStyleIdAsync(state.styles[style]);n.fills=[paint(color)];
 if(w){n.textAutoResize="HEIGHT";n.resize(w,30);}n.characters=value;return n;
}
function border(n,color="line"){n.strokes=[paint(color)];n.strokeWeight=1;}
function padding(n,value){n.paddingTop=value;n.paddingBottom=value;n.paddingLeft=value;n.paddingRight=value;const idx=[8,16,24].indexOf(value);if(idx>=0)for(const p of ["paddingTop","paddingBottom","paddingLeft","paddingRight"])n.setBoundVariable(p,spaces[idx]);}
function svg(parent,name,source,w,h){const n=remember(figma.createNodeFromSvg(source));n.name=name;parent.appendChild(n);n.resize(w,h);for(const c of n.findAll(()=>true))ids.push(c.id);return n;}
const doodle='<svg width="280" height="164" viewBox="0 0 280 164" xmlns="http://www.w3.org/2000/svg" fill="none"><g stroke="#20211E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M47 58C53 29 138 20 212 41C293 64 244 140 124 135C-6 130-3 71 66 48" stroke-dasharray="3 7"/><path d="M78 29L160 39L143 130L104 99L67 110Z" fill="#F5F4EF"/><path d="M103 39L186 49L169 140L130 109L93 119Z" fill="#FFFDF7"/><path d="M121 61L161 66M117 72L157 77M114 82L140 86"/><path d="M211 24L214 39L228 43L214 47L211 62L207 47L193 43L207 39Z"/><path d="M42 114L46 126L59 129L46 132L42 145L39 132L27 129L39 126Z"/><circle cx="222" cy="108" r="17"/><path d="M234 120L248 134"/></g></svg>';
const bookmark='<svg width="26" height="32" viewBox="0 0 26 32" xmlns="http://www.w3.org/2000/svg" fill="none"><path d="M4 3L22 2L21 29L13 22L5 29Z" stroke="#20211E" stroke-width="1.5"/><path d="M9 9L18 8M9 13L16 12" stroke="#20211E"/></svg>';
const compArea=stack(page,"Components / reusable",440,24);compArea.x=200;compArea.y=1450;
async function buttonComponent(label,filled){
 const c=remember(figma.createComponent());compArea.appendChild(c);c.name=filled?"Button / Primary":"Button / Outline";c.description="Recall 操作按钮；中文标签，纸白与墨黑。";c.layoutMode="HORIZONTAL";c.resize(140,42);c.primaryAxisSizingMode="AUTO";c.counterAxisSizingMode="AUTO";c.counterAxisAlignItems="CENTER";c.itemSpacing=8;c.paddingLeft=18;c.paddingRight=18;c.paddingTop=11;c.paddingBottom=11;c.fills=[paint(filled?"ink":"paper")];border(c,filled?"ink":"line");
 const t=await text(c,"Label",label,"Label",null,filled?"paper":"ink");const p=c.addComponentProperty("Label","TEXT",label);t.componentPropertyReferences={characters:p};return {c,p};
}
const primary=await buttonComponent("同步书签 ↗",true),outline=await buttonComponent("连接 X 账号 ↗",false);
function btn(parent,label,kind=primary){const n=remember(kind.c.createInstance());parent.appendChild(n);n.setProperties({[kind.p]:label});return n;}
const card=remember(figma.createComponent());compArea.appendChild(card);card.name="Bookmark / Archive Card";card.description="保存完整原文及来源；分类标签可编辑；演示内容不冒充用户书签。";card.layoutMode="VERTICAL";card.resize(354,250);card.primaryAxisSizingMode="FIXED";card.counterAxisSizingMode="FIXED";card.itemSpacing=12;card.fills=[paint("surface")];border(card);padding(card,22);
const cp={};
for(const [name,value,style,w,color]of [["Meta","001 / 工作实践","Mono",310,"muted"],["Title","AI 产品经理的第一份作品集","Title",310,"ink"],["Excerpt","从真实问题开始，记录取舍、验证过程，以及你如何判断产品是否有效。","Body",310,"muted"],["Source","@product_notes · 示例内容 ↗","Mono",310,"muted"]]){
 const t=await text(card,name,value,style,w,color);const prop=card.addComponentProperty(name,"TEXT",value);t.componentPropertyReferences={characters:prop};cp[name]=prop;
}
const data=[
["001 / 工作实践","AI 产品经理的第一份作品集","从真实问题开始，记录取舍、验证过程，以及你如何判断产品是否有效。","@product_notes · 示例内容 ↗"],
["002 / 激励与警醒","先开始，再慢慢变好。","“别把准备当成进步。做一个很小的版本，才会知道下一步。”","@slow_progress · 示例内容 ↗"],
["003 / 资源合集","留给下次面试的工具箱","产品面试题库、案例拆解、简历检查清单。需要的时候，终于能找回来。","@career_archive · 示例内容 ↗"],
["004 / 学习与效率","给注意力留一块空白","试着把最费脑的工作放在第一个时间段，关闭干扰，只推进一个问题。","@focus_lab · 示例内容 ↗"],
["005 / 工作实践","把 AI 评估变成日常实践","先写出什么叫“好”，再从真实输入中收集失败案例，逐步建立评估集。","@ai_practice · 示例内容 ↗"],
["006 / 资源合集","一个持续更新的学习书架","数据分析、产品设计与 AI 入门资料。按你要解决的问题，而非网站名称查找。","@open_shelf · 示例内容 ↗"]];
function cardInstance(parent,row,index){const n=remember(card.createInstance());parent.appendChild(n);n.name="Bookmark "+index;n.setProperties(Object.fromEntries(Object.keys(cp).map((k,i)=>[cp[k],row[i]])));return n;}
async function navigation(side,active){
side.placeholder=false;side.resize(208,1120);side.paddingLeft=24;side.paddingRight=24;side.paddingTop=36;side.itemSpacing=24;side.strokes=[paint("line")];side.strokeRightWeight=1;side.strokeLeftWeight=0;side.strokeTopWeight=0;side.strokeBottomWeight=0;
const logo=stack(side,"Logo",160,12,"HORIZONTAL");svg(logo,"hand drawn bookmark",bookmark,26,32);await text(logo,"Brand","拾回","Brand");
await text(side,"Wordmark","RECALL / PERSONAL ARCHIVE","Mono",160,"muted");
const nav=stack(side,"Navigation",160,8);
for(const [i,label]of ["全部收藏","分类索引","同步与连接"].entries()){
const n=stack(nav,"Nav "+label,160,8,"HORIZONTAL",i===active?"ink":null);padding(n,12);await text(n,"Label",label,"Label",120,i===active?"paper":"ink");refs["nav"+side.id+i]=n.id;}
const mark=stack(side,"Collection note",160,8);await text(mark,"Caption","收藏之后，\n还会再遇见。","Title",160);
const spacer=stack(side,"Spacer",160,0);spacer.resize(160,420);spacer.primaryAxisSizingMode="FIXED";
const bottom=stack(side,"Account",160,8);await text(bottom,"Account label","X 账号尚未连接","Label",160);await text(bottom,"Mode label","当前展示示例收藏","Mono",160,"muted");refs["connect"+side.id]=btn(bottom,"连接 X ↗",outline).id;
}
async function header(main,label){
const h=stack(main,"Header",1136,24,"HORIZONTAL");h.counterAxisAlignItems="CENTER";
await text(h,"Location","PERSONAL ARCHIVE  /  "+label,"Mono",856,"muted");refs["sync"+main.id]=btn(h,"同步与连接 ↗",outline).id;
}
async function searchBox(main,value){
const s=stack(main,"Search",1136,16,"HORIZONTAL","surface");padding(s,20);border(s,"ink");await text(s,"Search icon","⌕","Brand");await text(s,"Search input",value,"Body",916,"muted");const n=await text(s,"Search shortcut","↵ 搜索","Mono",100);refs["search"+main.id]=s.id;return s;
}
async function categories(main){
const row=stack(main,"Categories",1136,12,"HORIZONTAL");
for(const [i,label]of ["全部","激励与警醒","学习与效率","工作实践","资源合集"].entries()){const p=stack(row,"Filter "+label,[72,142,142,126,126][i],0,"HORIZONTAL",i===0?"ink":null);padding(p,10);if(i!==0)border(p);await text(p,"Label",label,"Label",null,i===0?"paper":"ink");}
}
for(const [i,rootInfo]of state.roots.entries()){
const root=await figma.getNodeByIdAsync(rootInfo.id),side=await figma.getNodeByIdAsync(rootInfo.sidebar),main=await figma.getNodeByIdAsync(rootInfo.main);
root.resize(1440,1120);main.resize(1232,1120);main.paddingTop=32;main.paddingBottom=32;main.paddingLeft=48;main.paddingRight=48;main.itemSpacing=24;main.placeholder=false;root.placeholder=false;mutated.push(root.id,side.id,main.id);
await navigation(side,i===3?2:0);await header(main,["ALL BOOKMARKS","SEARCH RESULTS","BOOKMARK DETAIL","CONNECTION"][i]);
if(i===0){
const hero=stack(main,"Editorial hero",1136,44,"HORIZONTAL");hero.counterAxisAlignItems="CENTER";
const intro=stack(hero,"Intro",800,8);await text(intro,"Eyebrow","那些值得留下的，现在都能找到。","Mono",800,"muted");await text(intro,"Headline","把散落的灵感，拾回来。","Display",800);await text(intro,"Description","记得一句话、一个主题，或者只是一个模糊的印象。","Body",800,"muted");svg(hero,"Archive orbit illustration",doodle,280,164);
await searchBox(main,"试着描述：那个讲 AI 产品经理面试的帖子");await categories(main);
const section=stack(main,"Section title",1136,16,"HORIZONTAL");await text(section,"Title","最近拾回","Title",848);await text(section,"Demo count","6 条示例 · 按导入时间","Mono",272,"muted");
for(let r=0;r<2;r++){const row=stack(main,"Card row "+r,1136,24,"HORIZONTAL");for(let j=0;j<3;j++){const n=cardInstance(row,data[r*3+j],r*3+j);refs["card"+(r*3+j)]=n.id;}}
await text(main,"Footnote","示例内容用于展示设计。连接账号后，这里会显示你的书签。","Mono",1136,"muted");
}else if(i===1){
await text(main,"Headline","你记得的，大概是这个。","Display",1136);await searchBox(main,"之前那篇讲 AI 产品经理怎么做作品集的");await categories(main);
await text(main,"Result description","找到 2 条相关示例 · 匹配了「AI 产品经理」「作品集」「实践」","Body",1136,"muted");
const row=stack(main,"Search composition",1136,32,"HORIZONTAL");
const results=stack(row,"Results",540,16);for(const d of [data[0],data[4]]){const n=cardInstance(results,d,0);n.resize(540,250);for(const t of n.findAllWithCriteria({types:["TEXT"]})){t.resize(496,t.height);mutated.push(t.id);}refs["result"+n.id]=n.id;}
const aside=stack(row,"Helpful prompt",540,24);svg(aside,"Search orbit",doodle,280,164);await text(aside,"Note","只记得大意，也没关系。","Title",440);await text(aside,"Explanation","搜索会同时参考原文与主题。打开结果后，可以核对完整内容和来源。","Body",440,"muted");await text(aside,"Suggestion","也可以试试\n「面试题库」  「评估失败案例」","Mono",440,"muted");
}else if(i===2){
refs.back=btn(main,"← 返回收藏库",outline).id;
const row=stack(main,"Detail composition",1136,48,"HORIZONTAL");
const article=stack(row,"Original content",740,20,"VERTICAL","surface");padding(article,32);border(article);
await text(article,"Meta","001 / 工作实践 · 示例原文","Mono",676,"muted");
await text(article,"Title","AI 产品经理的第一份作品集","Display",676);
await text(article,"Author","Product Notes  /  @product_notes","Mono",676,"muted");
await text(article,"Original post","一份好的作品集，不是把功能截图排成一份 PDF。\n\n从一个具体问题出发：谁遇到了什么困难？现有方法为什么不够好？\n\n记录你怎样定义目标、选择方案、验证效果，以及遇到失败后如何修改。\n\n对于 AI 产品，还要说明评估标准、失败案例与成本取舍。\n\n让别人看见你的判断过程，比罗列工具名称更有说服力。","Body",676);
await text(article,"Original note","以上为设计示例，非真实 X 推文。","Mono",676,"muted");btn(article,"查看原帖 ↗");
const meta=stack(row,"Metadata",348,24);await text(meta,"Label","这条收藏","Title",348);await text(meta,"Class","自动整理到\n工作实践","Body",348);btn(meta,"修改分类",outline);await text(meta,"Topics","相关主题\nAI 产品经理 / 作品集 / 面试","Body",348);await text(meta,"Imported","导入时间\n连接后显示真实记录","Body",348,"muted");await text(meta,"Source note","原文与来源保留在一起，\n方便下次确认。","Title",348);
}else{
await text(main,"Headline","让书签，来这里安个家。","Display",1136);await text(main,"Explanation","连接你的 X 账号，导入已有收藏。以后仍然像往常一样点书签。","Body",1136,"muted");
const row=stack(main,"Sync composition",1136,32,"HORIZONTAL");
const panel=stack(row,"Connection panel",620,24,"VERTICAL","surface");padding(panel,32);border(panel,"ink");
await text(panel,"State","01 / 尚未连接","Mono",556,"muted");await text(panel,"Title","连接 X 账号","Title",556);await text(panel,"Description","授权读取你的书签，保留原文和来源，并自动整理为四个主题。","Body",556);
refs.authorize=btn(panel,"连接 X 账号 ↗");
await text(panel,"Read only","读取本人书签 · 不发布内容","Mono",556,"muted");
await text(panel,"Progress heading","同步后的进度展示","Label",556);
for(const line of ["① 读取书签 — 显示实际获取数量","② 自动整理 — 已分类 / 待确认","③ 完成导入 — 查看收藏库"]){await text(panel,line,line,"Body",556,"muted");}
await text(panel,"Partial state","部分内容未获取时，保留已导入内容，并显示失败数量与重试入口。","Body",556,"muted");
const note=stack(row,"Sync note",484,24);svg(note,"Sync illustration",doodle,280,164);await text(note,"Title","你负责收藏，\n这里负责整理。","Display",484);await text(note,"Description","历史收藏覆盖范围以实际同步结果为准。记录导入时间，保留你手动修改过的分类。","Body",484,"muted");
}
}
const navTo=async(id,destination)=>{const n=await figma.getNodeByIdAsync(id);await n.setReactionsAsync([{trigger:{type:"ON_CLICK"},actions:[{type:"NODE",destinationId:destination,navigation:"NAVIGATE",transition:null}]}]);mutated.push(id);};
for(const root of state.roots){if(root.id!==state.roots[3].id){await navTo(refs["sync"+root.main],state.roots[3].id);await navTo(refs["connect"+root.sidebar],state.roots[3].id);await navTo(refs["nav"+root.sidebar+"2"],state.roots[3].id);}if(root.id!==state.roots[0].id)await navTo(refs["nav"+root.sidebar+"0"],state.roots[0].id);}
await navTo(refs["search"+state.roots[0].main],state.roots[1].id);for(let i=0;i<6;i++)await navTo(refs["card"+i],state.roots[2].id);await navTo(refs.back,state.roots[0].id);
const evidence=[];
for(const root of state.roots){const n=await figma.getNodeByIdAsync(root.id);const nodes=n.findAll(()=>true);const counts={};for(const c of nodes)counts[c.type]=(counts[c.type]||0)+1;const imageNodes=nodes.filter(c=>"fills" in c&&Array.isArray(c.fills)&&c.fills.some(p=>p.type==="IMAGE"));evidence.push({id:n.id,name:n.name,width:n.width,height:n.height,counts,imageNodes:imageNodes.map(n=>({id:n.id,name:n.name})),fonts:[...new Set(nodes.filter(n=>n.type==="TEXT").map(n=>n.fontName.family))]});}
return {createdNodeIds:ids,mutatedNodeIds:mutated,components:{primary:primary.c.id,outline:outline.c.id,card:card.id},refs,evidence};
