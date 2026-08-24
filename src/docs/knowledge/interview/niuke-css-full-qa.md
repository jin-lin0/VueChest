---
group: 牛客全量答案
order: 53
---

# 牛客全量标准答案 · 三、CSS / 渲染与布局

> 本文按章节逐条对应《牛客面试题库》，题目标题即匹配依据；维护时只需保证题目文本、所属文件和小节一致。

---

## 三、CSS / 渲染与布局

### 浏览器页面渲染流程是什么？HTML 解析过程中遇到 script 会发生什么？输入 URL 到页面渲染的完整过程（含 DOM/CSSOM/渲染树/布局/绘制、重排重绘例子）？

> “URL 阶段经过缓存、DNS、TCP/TLS 和 HTTP；浏览器流式解析 HTML 生成 DOM，CSS 生成 CSSOM，两者参与渲染树，再做样式计算、布局、绘制、分层和合成。同步普通 script 会暂停 HTML 解析，等待脚本下载执行，因为它可能修改文档；defer/async 规则不同。改宽高可能触发布局和绘制，改颜色通常只绘制，transform/opacity 常可只合成。定位要看 Performance 流程而非死背。”

### 什么是重排（reflow）和重绘（repaint）？如何减少？合成层（GPU 合成层）如何提升渲染性能？如何开启合成层？离屏渲染是什么、有什么缺点？

> “重排是几何信息变化后重新布局，重绘是像素外观变化重新绘制；布局通常会连带绘制。减少方式包括批量 DOM、避免读写布局交错、固定图片尺寸、用 transform/opacity 做动画。浏览器可把元素提升为合成层，GPU 合成时只移动纹理；`will-change` 可提示但不能滥用。离屏渲染把内容先画到缓冲区/OffscreenCanvas，再合成，能隔离工作，也会增加显存、拷贝和层管理成本。”

### 水平垂直居中有哪些方法？为什么用 transform？相对哪个元素？有没有不改动父元素的方法？浮动怎么实现居中？

> “未知尺寸首选父级 flex/grid：`display:grid; place-items:center`。定位法用 absolute 50% 加 `transform:translate(-50%,-50%)`，百分比位移相对元素自身尺寸，所以不需知道宽高；margin auto 可配定位 inset 0 和固定尺寸。不改父元素时可用自身 absolute/transform，但仍依赖定位包含块。浮动本身不适合居中，可用包裹元素 left:50% 再子项 right:50% 的旧技巧，现代项目不建议。”

### 盒模型是什么、由什么组成？box-sizing 的作用？text-indent 是否计算在盒模型内？position 默认值、各定位值与特点（relative 是否脱离文档流、absolute 与 fixed 区别、fixed 相对什么定位）？

> “盒模型由 content、padding、border、margin 组成。默认 content-box 的 width 只算内容，border-box 把 padding/border 包进声明宽高；margin 永远在外。`text-indent` 影响行内内容起始位置，不改变盒模型尺寸。position 默认 static；relative 不脱离文档流，只视觉偏移并建立定位参考；absolute 脱离流，相对最近定位祖先；fixed 通常相对视口，但 transform 等属性可能创建其包含块；sticky 在滚动阈值间切换。”

### flex:1 对应的三个参数（grow / shrink / basis）？flex 如何垂直水平居中？Flex 布局原理、常用属性？不知道子元素数量时如何让子元素等间距 / 等宽排列？

> “常见 `flex:1` 展开为 `1 1 0%`，但关键字展开细节要以规范/浏览器为准；grow 分剩余空间，shrink 处理不足空间，basis 是主轴基准尺寸。居中用 `justify-content:center; align-items:center`。等间距可 `space-between/space-evenly`；等宽子项用 `flex:1 1 0`，同时设置 `min-width:0` 防内容撑开。Flex 是一维布局，先计算基准、冻结超限项，再分配正负自由空间。”

### 三栏布局有哪些实现方式（双飞翼 / 两侧固定中间自适应）？

> “现代三栏首选 Grid：`grid-template-columns: 200px minmax(0,1fr) 200px`，或 Flex 让中间 `flex:1; min-width:0`。传统圣杯/双飞翼利用浮动、负 margin 和中间 100% 宽度，双飞翼多一层中间包裹避免 padding 挤占。面试可讲原理，但生产优先 Grid/Flex，因为语义清楚、顺序和响应式更容易维护。”

### BFC 是什么、特点？清除浮动 / 高度塌陷、clear 的使用？margin 合并现象（垂直合并）？

> “BFC 是独立块级格式化上下文，内部块布局和浮动参与其高度，外部浮动不侵入。可由 `display:flow-root`、overflow 非 visible、定位、flex/grid item 等创建；清浮动首选 flow-root 或伪元素 clearfix，`clear` 让元素边界避开前方浮动。相邻普通块的垂直 margin 可能折叠，父子也有条件折叠；建立 BFC、border/padding 或改变布局上下文可阻止，但应先理解需求而非乱加 overflow。”

### 不用 border-radius 如何实现一个圆？如何用 CSS 做成一个三角形、并让它保持旋转？

> “不用 border-radius 可用 SVG circle、`clip-path:circle()` 或 radial-gradient 画圆，具体看是否要真实裁剪和交互区域。CSS 三角形常用零宽高元素，让四边透明 border 中一边着色，也可用 clip-path polygon。旋转通过 `transform:rotate()`，动画中保留已有 transform 要组合在同一属性或用嵌套元素/CSS 独立 transform 属性，避免后一个规则覆盖前一个。”

### 行内元素与块级元素分别有哪些？display:none 与 visibility:hidden、opacity:0 的核心区别？让页面元素隐藏的几种方式？

> “块级元素通常独占一行并参与块布局，如 div/p/section；行内元素按行排布，如 span/a，具体表现由 display 决定，HTML 语义和 CSS display 不等同。display:none 不布局不绘制且通常离开可访问树；visibility:hidden 保留空间；opacity:0 仍布局并可交互。还可用 hidden、移出视口、clip、content-visibility 等，但焦点、读屏和事件语义不同，不能只看不可见。”

### HTML 的 head / body？meta / link / style？link 与 @import 的区别？link 可引入哪些资源、type 做什么、能否跨域？script 跨域吗、async / defer 区别？JS 放在 HTML 前面且无异步属性会造成什么后果？JS 报错会对页面渲染产生什么影响？

> “head 放元数据和资源声明，body 放文档内容；meta 描述编码/视口等，link 关联 CSS、图标、preload，style 内嵌 CSS。link 可并行发现且用途多，`@import` 在 CSS 中再发现，常更晚；跨域是否可用受资源类型、CORS/CORP影响。经典 script 可跨源加载但读不到源码响应，普通同步脚本会阻塞解析；async 下载完即执行、顺序不保，defer 解析后按序。脚本抛错停止当前脚本后续，不必然停止 HTML 渲染，但可能让应用初始化失败。”

### CSS 选择器有哪些、优先级？!important 优先级？BEM 命名规范的应用场景与优缺点？

> “选择器有元素、类/属性/伪类、ID、组合器和伪元素。层叠先看来源与重要性、cascade layer，再看 specificity、作用域距离和源码顺序；粗略权重是 ID 高于类/属性/伪类，高于元素，`:where()` 为零。`!important` 进入重要声明层，不是简单无限大权重，仍参与来源和层。BEM 用 block\_\_element--modifier 降低冲突、适合全局 CSS 团队，但类名长且组合状态繁琐，可与 Modules/token 配合。”

### CSS 长度单位（px / em / rem / vw / vh / rpx / vmax / vmin / 百分比）？10vh 含义？rpx 用过吗？

> “px 是 CSS 像素；em 相对当前元素字体（font-size 自身计算时相对父级），rem 相对根字体；vw/vh 相对视口，10vh 是视口高度的 10%，移动端还要关注 svh/lvh/dvh；vmin/vmax 取两轴较小/大者；百分比取决于属性的包含块规则。rpx 是小程序响应式单位，通常把屏幕宽分 750 份，不是 Web 标准。单位按设计语义选，不要全部换算 rem。”

### 移动端适配方式（媒体查询、rem、vw/vh、px/em/rem 区别、iOS 安卓差异）？移动端安全区域（刘海 / 底部小黑条）适配（env(safe-area-inset-\*) / SafeAreaView）？

> “移动端以 viewport meta、流式 Flex/Grid、媒体/容器查询为主，字号与间距按 rem/clamp，页面宽度可用 vw，但避免地址栏导致旧 vh 跳动，优先动态视口单位。iOS/Android 要实机验证字体、键盘、滚动和触摸差异。Web 安全区用 `viewport-fit=cover` 加 `env(safe-area-inset-*)` padding；React Native 用 SafeAreaView 或安全区库。适配以设计断点和内容为准，不按设备型号堆判断。”

### 移动端 / 前端画圆的方式？前端拖动轴 / 滑块动态显隐怎么设置？CSS 里能写脚本吗？

> “圆可用 border-radius、SVG、Canvas、clip-path 或 radial-gradient。滑块动态显隐可让轨道在 hover/focus-within 时显示，拖动状态由 JS 加 class，注意键盘 focus 和触摸设备没有 hover。标准 CSS 不能执行任意脚本，它是声明式样式语言；历史 expression 等危险特性早已淘汰。复杂交互由 HTML/JS 状态驱动，CSS 根据 class/属性渲染。”

### 实现一个 button 渐变效果（深红到浅红）的多种方式？鼠标的拖尾效果怎么实现？

> “按钮渐变可用 `linear-gradient(#7a0000,#ff6b6b)` 背景，也可用伪元素叠层配合 opacity 做 hover，或多背景/渐变边框；要保证文字对比度和 disabled/focus 状态。鼠标拖尾可在 pointermove 采样坐标，用固定元素、Canvas 粒子或 WebGL 绘制，rAF 合并更新并限制粒子池；不要每次事件创建无限 DOM，且尊重 `prefers-reduced-motion`。”

### 单行 / 多行文本溢出隐藏？

> “单行省略需要可收缩宽度、`white-space:nowrap; overflow:hidden; text-overflow:ellipsis`，Flex 子项常补 `min-width:0`。多行可用 `display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:n; overflow:hidden`，现代浏览器也逐步支持 line-clamp。它只隐藏视觉内容，完整文本、可访问性和复制需求要通过 title、展开按钮或服务端摘要另行设计。”

### 定义一个动画有哪几种方式（animation / transform / CSS3 动画）？轮播图过渡效果？用 CSS 实现点击方块动态设置背景色、animation 简单动画？

> “CSS transition 适合两个状态间过渡，animation+@keyframes 适合多阶段和循环；transform/opacity 是属性，常因只需合成而适合动画。轮播可用容器 translateX 配 transition，循环需克隆/瞬移处理边界并暂停不可见页。点击改背景本质要由 checkbox/`:checked`、`:target` 或 JS class 提供状态，CSS 负责过渡；复杂可控动画用 Web Animations API。都要考虑 reduced-motion。”

### 响应式布局的方式（媒体查询、rem 等）？设计封装响应式布局的组件？i18n 原理及性能优化？

> “响应式布局组合流式尺寸、Flex/Grid、媒体查询、容器查询、rem/clamp 和响应式图片。组件应以容器宽度和语义 props 决定列数，不直接读取全局 window；可用 ResizeObserver 或 CSS Container Queries。i18n 是 key 到 locale message 的解析、变量/复数/日期数字格式化和 fallback；性能上按 locale/namespace 懒加载、编译消息、缓存 Intl formatter，并处理 RTL 和长文本布局。”

### 图片格式 jpg / svg / png / webp 优缺点与适用场景？为什么 WebP 而不用 PNG/JPG？Base64 的作用？

> “JPEG 适合照片、有损且无透明；PNG 无损、透明好，适合截图和像素图但体积大；SVG 是矢量 XML，适合图标并可交互，但复杂图形节点多且不宜直接信任外部内容；WebP 同时支持有损/无损和透明，通常体积更优，但最终要用实际图片比较，也可评估 AVIF。Base64 把二进制嵌进文本，减少小资源请求但膨胀约三分之一、破坏独立缓存，大图不适合。”

### canvas 与 svg 的区别及各自用途？canvas 绘制点 / 线、如何给 canvas 添加点击事件、如何绘制 5 万条数据、地图绘制大量点为什么影响性能？svg 节点渲染卡顿如何优化？

> “Canvas 是即时像素绘制，节点不保留，适合大量点、游戏；SVG 保留 DOM 节点，易样式、事件和无障碍，适合中小规模矢量。Canvas 点击要把坐标换算到画布并自行做 hit testing/空间索引。5 万点用批量 path、离屏缓存、分帧、Worker+OffscreenCanvas、视口裁剪或 WebGL instancing。SVG 卡顿则减少节点、合并 path、虚拟化/LOD，地图大量点慢通常是节点/绘制和交互命中共同成本。”

### 暗黑 / 亮色主题切换怎么实现？PC 端暗黑模式怎么适配？

> “我用语义化 CSS 变量定义背景、文字、边框、强调色，在根节点用 `data-theme` 或 class 切换，组件不写死颜色；首次根据 `prefers-color-scheme` 与持久化偏好在首屏脚本尽早设置，避免闪烁。PC 端还要检查图表、图片、滚动条、代码高亮和第三方组件，并保证对比度。主题选择写 localStorage/账户，跨 iframe 可通过消息同步。”

### 如何做移动端 / H5 适配、iOS 安卓端适配差异？如何做 SEO 规范？

> “H5 适配先做 viewport、响应式布局、动态视口、安全区、触摸目标和软键盘，再实测 iOS Safari 与 Android WebView 的滚动、字体、音视频和权限差异；用 capability detection 而不是 UA 硬编码。SEO 需要语义 HTML、唯一 title/description、canonical、robots/sitemap、结构化数据、可抓取链接和良好性能；强内容站优先 SSR/SSG，JS hydration 后内容不是唯一方案。”

### DOM 事件流动机制（捕获和冒泡）？事件冒泡和事件捕获？父元素触发的事件怎么防止传递给子元素？事件流、事件委托、addEventListener 的 capture / 冒泡、第三个参数（useCapture）？处于事件阶段？

> “DOM 事件路径先从 window 向目标捕获，再在 target，随后向上冒泡；`addEventListener` 第三个参数或 options.capture 决定监听阶段，eventPhase 可观察阶段。`stopPropagation` 阻止继续传播，`stopImmediatePropagation` 还阻止同节点后续监听，`preventDefault` 只阻止默认行为。父事件通常不会‘传给子’，而是目标事件向父冒泡；若父捕获监听不想响应子目标，可判断 `target===currentTarget`。事件委托利用冒泡。”

### 大模型输出快慢对 RAF 的优劣势、如何平衡不同输出频率下 RAF 的表现？requestAnimationFrame 是什么、作用？

> “rAF 把视觉更新安排到浏览器下一次绘制前，同一帧可合并多个模型 chunk，避免高频响应式更新和滚动抖动。模型输出慢时每个 chunk 单独等 rAF 会增加最多一帧延迟；输出快时合并收益明显。我的策略是 buffer 增量，只保持一个待执行 rAF，帧内一次提交；结束时 flush，后台标签页用时间兜底，并根据 chunk 频率设置最大等待时间。”

### 页面抖动 bug 怎么处理？平时怎么定位和修改样式问题？

> “先用录屏和 DevTools Elements/Computed 找是布局变化、滚动条出现、字体/图片晚加载还是 JS 反复改样式；Performance 看 Layout Shift 和强制布局调用栈，临时给元素 outline 观察边界。常见修复是预留图片/骨架尺寸、稳定字体指标、避免读写交错、固定滚动条槽和删除竞争 CSS。修改样式先确认层叠来源、specificity、包含块和 BFC，不用盲加 important。”

### Three.js / WebGL 项目怎么做离屏渲染？还做了哪些渲染优化？切换场景时如何防止内存泄漏（材质 / 几何体 / 纹理是否需要手动释放）？

> “Three.js 离屏可用 WebGLRenderTarget 把场景渲染到纹理做后处理，也可在 Worker 用 OffscreenCanvas（看浏览器/库支持）移出主线程。优化包括合并 draw call、InstancedMesh、LOD/视锥裁剪、纹理压缩、降低 DPR、对象池和按需渲染。切场景要遍历并 `dispose` geometry、material、texture、render target，移除监听/动画循环，renderer 和缓存按生命周期处理；仅从 scene remove 不会释放 GPU 资源。”

### 常用的 CSS 布局方案有哪些？Flex 和 Grid 的区别是什么、分别适合什么场景？

> “常见布局有普通流、定位、Flex、Grid、浮动和多列。Flex 是一维布局，擅长一行或一列的对齐、分配剩余空间和组件内部结构；Grid 同时控制行列，适合页面骨架、二维卡片和明确网格。两者可嵌套：Grid 管宏观，Flex 管单元内部。浮动主要保留给图文环绕，定位用于叠层，不应拿 absolute 做全部响应式布局。”

### CSS 场景题：顶部导航条 + 中间内容区 + 底部 footer，内容区较短时 footer 紧贴内容区、内容区较长时 footer 固定在页面底部且内容区占满剩余高度并在自身内部滚动，怎么实现（sticky footer / flex 布局）？

> “页面根容器设 `min-height:100dvh; display:flex; flex-direction:column; overflow:hidden`，header/footer `flex:none`，main `flex:1; min-height:0; overflow:auto`。这样 main 短时占满剩余高度，footer 位于视口底部；内容长时由 main 自身滚动，header/footer 不动。若需求是整页滚动且短内容 footer 底部，则根只用 min-height，main flex:1，不给 main overflow。”

---

## 参考来源

- [牛客网面试经验](https://www.nowcoder.com/discuss)
