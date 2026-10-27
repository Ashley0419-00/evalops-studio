# EvalOps Studio

EvalOps Studio 是一个面向大模型应用团队的评测与发布决策平台，覆盖评测集管理、模型调用、指标对比、Bad Case 归因、Prompt 版本迭代与发布门禁，帮助团队将分散的测试结果转化为可追踪的产品决策。

**在线体验：[EvalOps Studio](https://evalops-studio-ashley.briskyew12.chatgpt.site/)**

> 说明：概览页保留了一组明确标注的演示案例；登录后发起的评测会真实调用模型、写入数据库并生成可下载报告。演示案例不代表真实公司表现。

## Full-stack MVP

- **Worker API**：健康检查、运行评测、历史记录、报告下载、监控指标。
- **OpenAI Responses API**：服务端模型调用，密钥不进入浏览器或仓库。
- **D1 数据库**：用户、评测运行、逐条 Case、Token/成本、请求指标。
- **ChatGPT Sign-in**：真实评测必须登录；公开访客可浏览案例研究。
- **自动评测**：关键词覆盖规则、通过率、P95 延迟、Token 与成本估算。
- **线上监控**：记录 API 路径、状态码、耗时与 24 小时聚合指标。

> 客观边界：这是可运行的 portfolio-grade MVP，不是企业生产系统。当前评分器为确定性规则，不等同于经人工校准的 LLM-as-a-Judge；生产化仍需限流、告警通知、审计、数据脱敏和完整 RBAC。

## 为什么做这个项目

大模型应用上线通常同时面对四类问题：

1. 质量指标与业务目标脱节；
2. Bad Case 被记录但没有转化为迭代动作；
3. 只比较模型能力，忽略延迟与成本；
4. 缺乏可执行的 Go / No-Go 上线标准。

EvalOps Studio 用一个“智能客服 Agent”案例展示如何把这些问题组织成可复用的评测运营流程。

## 核心模块

- **评测总览**：通过率、幻觉率、P95 延迟、千次会话成本和版本趋势。
- **模型评测**：在统一数据集与 Rubric 下比较质量、性能、成本与安全。
- **Bad Case 工作台**：按风险、状态和根因分类，并关联改进项。
- **Prompt Lab**：Prompt 版本差异、指标影响与实验结论。
- **发布门禁**：将指标阈值转为灰度发布决策和观察计划。

## 产品方法

综合分并不直接决定上线。项目采用“硬门槛 + 多目标权衡”：

- 质量、安全、性能必须达到最低门槛；
- 达标后再比较单位成本与用户体验；
- 对超线指标设置灰度比例、预算告警和复盘时间；
- 每个失败类型必须映射到数据、Prompt、检索或产品流程中的可执行动作。

## 项目结构

```text
dist/
  index.html       # 页面与内容结构
  styles.css       # 响应式视觉系统
  runtime.css      # 全核运行状态样式
  app.js           # 导航、真实评测、历史运行与报告入口
worker/
  template.js      # Worker API、模型调用、鉴权与监控
migrations/
  0000_init.sql    # D1 数据库结构
scripts/
  build-worker.mjs # 生成部署包
data/
  evaluation-runs.json
  bad-cases.json
docs/
  case-study.md
```

## 本地运行

静态界面可直接预览：

```bash
python3 -m http.server 8080 --directory dist
```

浏览器打开 `http://localhost:8080`。

构建 Worker 部署产物：

```bash
node scripts/build-worker.mjs
node --check build/dist/index.js
```

运行所需变量见 `.env.example`。真实密钥必须配置为托管平台 Secret，禁止提交到 Git。

## 面试讲解建议（3 分钟）

1. **问题**：LLM 应用的上线决策不能只看准确率。
2. **框架**：质量、安全、性能是硬门槛，成本是规模化约束。
3. **案例**：Model B 质量略高，但延迟和成本显著增加，因此选择 Model A 灰度。
4. **闭环**：Bad Case 归因后进入 Prompt / 检索 / 数据集迭代，再通过回归集验证。
5. **结果**：演示中 v2.4 的通过率提升 5.8%，但成本增加，因此采用 10% 灰度与 48 小时复盘。

## 开源参考

本项目是独立实现的作品集案例，方法论参考了 Promptfoo 与 DeepEval 的公开评测思路；未复制其代码。详见 `docs/case-study.md`。
