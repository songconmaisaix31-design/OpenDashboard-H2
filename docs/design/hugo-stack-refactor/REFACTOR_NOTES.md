# H2 Sentinel · Hugo Stack 视觉重构说明

## 这次重构做了什么

本次没有把 React/TypeScript 比赛前端改写成 Hugo，也没有改动数据契约、分析流程、路由协议或 `H2SentinelDataSource` 注入边界。重构方式是把个人主页常用的 Hugo Stack 组件语言移植到现有 React 页面：

- 左侧个人档案卡：项目定位、标签与产品身份；
- Stack 式分组导航：图标、标题、说明和当前页状态；
- 文章封面式页面头图：主标题、摘要、动作入口；
- 层叠卡片内容区：指标、黄金案例、图表和事件列表；
- 右侧小组件栏：当前运行、数据集摘要和安全边界；
- 低饱和暗红配色：延续个人主页的红色基调，但降低视觉噪声；
- 移动端抽屉导航：桌面三栏在窄屏自动收束为单栏内容。

## 主要文件

```text
frontend/features/h2-sentinel/
├─ H2SentinelApp.tsx
├─ components/common/
│  ├─ H2Icon.tsx                # 无额外依赖的内联 SVG 图标
│  ├─ H2Shell.tsx               # Stack 式应用壳、导航、右栏与移动抽屉
│  ├─ PageHeader.tsx            # 文章封面式页头
│  └─ StackWidget.tsx           # 右侧上下文小组件
├─ components/provenance/
│  └─ ProvenanceBanner.tsx      # 紧凑来源卡
├─ model/chart-options.ts       # 与新主题一致的图表颜色和坐标样式
└─ styles/
   └─ hugo-stack-refactor.css   # 独立覆盖层，可单独回退
```

六个业务页面只增加了对应页头图标，业务展示结构和数据读取方式保持不变。

## 合并方式

完整包保持了上传压缩包的目录结构。直接对比或覆盖同名目录即可。新样式在原样式之后加载：

```ts
import './styles/h2-sentinel.css'
import './styles/hugo-stack-refactor.css'
```

因此需要回退视觉重构时，只需移除第二行 import，并恢复 `H2Shell.tsx`、`PageHeader.tsx` 和 `ProvenanceBanner.tsx`。

## 设计预览

根目录包含：

- `design-preview.html`：不依赖 React 构建即可查看的静态设计稿；
- `h2-sentinel-refactor-desktop.png`：桌面端预览；
- `h2-sentinel-refactor-mobile.png`：移动端单栏预览；
- `h2-sentinel-refactor-mobile-menu.png`：移动端抽屉导航预览。

静态设计稿用于确认视觉方向，不替代真实 Fixture/Live 数据源的运行验证。

## 已完成验证

- 对 43 个 TypeScript/TSX 文件执行语法转译检查，未发现语法错误；
- 使用本地契约与最小 React/ECharts 类型声明执行 feature 级 TypeScript 检查，通过；
- `git diff --no-index --check` 未报告尾随空格或空白错误；
- 生成并人工检查了桌面与移动端预览截图。

当前压缩包不含根级 `package.json`、锁文件和已安装依赖，因此本环境无法对真实仓库执行 `npm ci`、完整测试或生产构建。合并回完整仓库后应按原项目流程补跑：

```bash
npm ci
npm run typecheck
npm run test
npm run build
npm run check
```

## 未改变的比赛边界

- 前端仍不直接 `fetch`；
- 业务计算仍不进入 React 组件；
- Fixture/Live 来源仍持续可见；
- 严重度仍由文字与标签共同表达，不只依赖颜色；
- 建议仍明确要求人工确认；
- 不执行设备控制，不替代 EMS。
