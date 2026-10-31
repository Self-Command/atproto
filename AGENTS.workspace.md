# AGENTS.workspace.md — atproto 企业叠加规则

> 本文件由工作区维护，补充上游 `AGENTS.md` 与包内嵌套 `AGENTS.md`，不替代它们。
> 开始任务前依次阅读：工作区根 `AGENTS.md` → 本文件 → 上游根 `AGENTS.md` → 目标包 `AGENTS.md`。
> 规则冲突、需要改变策略或发现阻塞时，必须停止并向用户提问，等待裁决。

## 1. 环境

- Node `>=22`；本机建议使用 `H:\Dev\Tools\node-24.22.1`。
- pnpm 固定 `11.11.0`，使用 Corepack；不依赖全局 pnpm。
- 集成测试需要 Docker（Postgres / Redis）；启动前确认资源与端口。

```bash
export PATH="/h/Dev/Tools/node-24.22.1:$PATH"
cd repos/atproto
corepack pnpm install
```

## 2. 流程

- 任何行为、Lexicon、XRPC、数据库、权限、依赖变更，先有 OpenSpec change 并通过用户审批。
- 先用 CodeGraph 定位实现、调用方、迁移与测试，再写提案。
- 动态注册、字符串拼接、NSID 映射、配置驱动路由等盲区必须用 `rg` 复核注册点；结论以包内 build / 测试为准（见工作区根 `AGENTS.md` 第 4 节）。
- 按包工作：进入 `packages/<pkg>` 执行该包的 build / test，不在根目录跑包级命令。
- 每个被改动的包必须有 changeset。
- 不运行全仓库 `style:fix`；按文件格式化与 lint。

## 3. Lexicon 与 codegen

- Lexicon 是契约；修改顺序：`lexicons/` → `pnpm lex:update-local` → `pnpm codegen` → 服务端 → 客户端。
- 新服务代码优先使用 `@atproto/lex` 系列，不手写 XRPC 签名。
- 不提交 gitignore 的生成目录（`./lexicons`、`./src/lexicons`）。
- 修改 `interop-test-files/` 仅限协议行为变化，并必须同步上游。
- 涉及测试前先读 `.agents/skills/testing/SKILL.md`；涉及 UI 流程读 `playwright` 技能。

## 4. 数据库

- 只做增量迁移；先加可空列，再回填，最后按需收紧。
- 大表回填分批、可中断、可恢复，记录游标与失败行。
- 迁移放入对应服务的现有目录，不跨服务复用。
- 新增查询先看现有索引与执行计划；不凭感觉加索引。
- 删除列、改类型、重命名属于破坏性变更，必须单独提案并获批准。

## 5. 安全不变量

- 服务端授权；新增/修改 XRPC 必须明确认证、角色、资源归属。
- DID 派生 URL 只用 `ctx.safeClient(url)`，禁止裸 `fetch` / `xrpc(url, ...)`。
- 多子节点 MST 遍历必须 `markVisited(seen)`，每次遍历新建 `CidSet`。
- 外部流必须设置解码后 `maxSize`；线格式上限不算数。
- Ozone 查询必须批量 hydration、限制返回行数、检查索引。
- 不提交秘密；日志脱敏；SQL 参数化。

## 6. 测试

- runner 以包内配置为准：Vite/Vitest 优先；Jest 仅维护遗留包。
- 单元测试与被测文件同目录；集成测试放包内 `tests/`。
- 集成测试使用 `@atproto/dev-env`，每个测试文件唯一 Postgres schema。
- 修改服务代码后先构建该包，再跑集成测试，避免加载旧 `dist`。
- 不 mock 真实协议契约；不跳过集成测试来“让 CI 变绿”。

## 7. 上游保持

- 不覆盖或重写上游 `AGENTS.md`；本文件是唯一叠加位置。
- 不批量格式化、不重命名上游包、不升级无关依赖。
- 同步上游后重跑：`node scripts/apply-repo-overlays.mjs`、`npm run verify`、`npm run codegraph:sync`。
- 本地开发分支保持提交主题单一，便于 rebase。
