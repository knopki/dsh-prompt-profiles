# 📦 @knopki/dsh-prompt-profiles

<div align="center">

<h3>DeepSeek Harness 的按会话提示配置：把可复用的系统提示词片段组合成多个命名配置，并在会话启动时固化进该会话的提示词</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@knopki/dsh-prompt-profiles"><img src="https://img.shields.io/npm/v/@knopki/dsh-prompt-profiles.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="#要求"><img src="https://img.shields.io/badge/DSH-0.1.7--rc.2-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="DSH version"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文</b></a>
</p>

<table align="center">
  <tr>
    <td align="center">
      ⭐ <strong>如果这个插件在你这里派上了用场，请在 GitHub 上点一颗星。</strong> 这样我才知道它还值得继续做下去。
      <br><br>
      🐛 <strong>发现 bug 或想要新功能？</strong> 用任何语言提 issue 都行。我都会看，有用的就做。
    </td>
  </tr>
</table>

</div>

---

![输入框里的配置标签](docs/screenshots/composer-chip.png)

## 概览

`@knopki/dsh-prompt-profiles` 为 DeepSeek Harness 的安装方案（`--profile`）增加了第二条轴：代理预设决定这个代理是什么，提示配置决定它以什么方式工作。同一个代理使用同一套工具时，既可以作为简洁的代码评审者运行，也可以作为遵循项目惯例的专家运行，差别只在于会话启动时选中的那份配置。

一份配置就是一组有序的片段引用。每条引用有自己的位置和作用范围，同一个片段因此可以出现在多份配置的不同位置上。配置在会话启动时选定，固化进这次会话的提示词，之后不再改动。不选配置时，系统提示词完全不变。

编辑器和输入框里的标签都在 Web 界面里，不用手写提示词也能拼出配置。

## 功能

- 片段可复用：写一次，挂到任意多份配置里，每条引用有自己的顺序和作用范围。
- 作用范围按引用设置（继承、仅主代理、仅子代理）：子代理可以看到父会话看不到的指令，同一个片段在另一份配置里又能对所有代理生效。
- 顺序是确定的：片段按配置里的顺序排列，并在平台内置片段之间占据稳定位置。
- 会话内固化：配置在组装提示词时解析，之后不再变化，恢复的会话拿到的还是它启动时的那一份。
- 显式放弃：选「无」和选一份配置一样，都会被固化成决定，而不是留下一个缺失值。
- 不选配置时，提示词的组装完全不受影响。
- 输入框里的配置标签：位于 `permission` 和 `plan` 旁，可为下一个会话选择配置；该选择按工作区保存。
- 跳过是安全的：未知片段、作用范围不符、已停用、内容为空或变量无法解析的片段只是不进提示词，会话不会因此失败。
- 编辑器支持拖放排序和键盘排序，带搜索、「用于」和「来源」信息、按配置预览和防抖自动保存。检测到并发修改时，编辑器会重新加载数据，而不是静默覆盖你的改动。
- 配置以 patch 行的形式存放在 `cordis.patch.yml`，和其余配置一样可以 diff 和评审。
- 没有第二个需要加固的传输通道：Web 客户端只通过平台的 Remote 通道访问主机。
- 界面提供英文、俄文和中文。

## 安装

```bash
dsh plugin --profile web add @knopki/dsh-prompt-profiles
```

从本地仓库或 git 地址安装：

```bash
dsh plugin --profile web add /path/to/dsh-prompt-profiles
```

`lib/` 已随仓库提供构建产物，安装不会触发构建。首次安装可以通过热更新直接生效；替换已安装的副本则需要重启 DSH。

卸载：

```bash
dsh plugin --profile web remove @knopki/dsh-prompt-profiles
```

## 快速开始

1. 打开 **设置 → 提示配置 → 片段**，新建一个片段：id、标题，以及要写进提示词的内容。
2. 切到 **配置** 标签，新建一份配置并往里添加片段。顺序可以拖动手柄或用方向键调整，作用范围在每一行上选择。
3. 打开一个新的空会话。`permission` 和 `plan` 旁边的配置标签用来给这个新会话选配置；该选择按工作区保存。

已经在跑的会话会保留启动时固化的提示词，所以配置对之后新建的会话生效。

## 输入框里的配置标签

- 只在空会话、且至少存在一份配置时显示。
- 「无」会显式放弃配置，并把这个决定固化下来。
- 选择按工作区记住：同一个工作区的下一个会话会带上同一份配置。
- 在完全替换提示词的模式下（例如 `minimal`，其预设设置了 `config.complete: true`），引擎会丢弃所有提示词片段。标签会用警告标出这一触发条件，此时配置不起作用。

## 编辑器

**设置 → 提示配置**有三个标签页：配置、片段和预览。

「配置」标签页列出所有配置和各自的片段数量，并设置新会话的默认配置。

![配置列表](docs/screenshots/settings-profiles-list.png)

打开一份配置后，它的片段按提示词顺序排列，中间夹着平台的内置片段，可以看清自己的文字在组装后的提示词里落在哪。拖动每行的手柄或直接填写顺序数字可以调整位置，作用范围在行上选择，行内图标用来编辑和移除片段。列表中每个配置旁边有复制和删除按钮。

![配置及其片段](docs/screenshots/settings-profile.png)

「片段」标签页列出所有片段和用到它们的配置，并可按 id 和标题过滤。

![片段列表](docs/screenshots/settings-sections-list.png)

片段有标题和内容，编辑后短暂停顿即自动保存。其他插件包提供的片段只能停用，其 id 不可修改。修改 id 不会重写配置里的引用，返回结果里会列出仍引用旧 id 的配置，需要手动改。

![单个片段](docs/screenshots/settings-section.png)

「预览」标签页显示所选配置在内置提示词片段之间的位置，并列出所有被跳过的片段及原因。

## 提示词变量

片段内容里可以写 `{{name}}` 这样的引用，例如 `{{cwd}}`。会话提示词固化时，运行时严格替换这些变量：未知或写错的引用会让该片段不进提示词，而不会产出损坏的提示词。编辑器里的预览刻意宽松，它会把这个片段标为已跳过并给出原因，让你看到运行时究竟会丢掉什么，而不是运行时根本不会生成的那段文字。

## 数据位置

| 数据 | 位置 |
|---|---|
| 片段和配置的定义、逐行覆盖 | 该安装方案在 `cordis.patch.yml` 中的 patch 行，由本插件的写入器维护 |
| `default` 和 `lastByWorkspace` | `prompt-profiles` 主行的易失性设置 |
| 每个会话的固化快照 | `$DSH_HOME/storages/prompt_profiles/sessions/<sessionId>.json`，每个会话一条记录 |

## 要求

- DSH `0.1.7-rc.2`。
- 所用安装方案自带的插件：主机端 `settings`、`configEditor`、`workspaceRegistry`、`storageDomain`、`typert` 和 `agentPresets`；Web 端 `@deepseek-ai/dsh-client-ui-settings`、`@deepseek-ai/dsh-client-ui-conversation` 和 `@deepseek-ai/dsh-client-ui-primitives`。
- 缺少可选服务时只影响对应功能，不会挡住插件的挂载。

## 开发

```bash
mise install          # Node、pnpm 以及本包针对的 DSH 版本
pnpm install --store-dir ./.pnpm-store
pnpm run build        # esbuild 打包 + tsc 生成声明到 lib/
pnpm test             # 主机端单元和差分测试（node --test）
pnpm run test:client  # 基于 React + jsdom 的客户端界面（vitest project client）
pnpm run test:remote  # 走真实 gateway 客户端的 Remote 链路（vitest project remote）
pnpm run lint         # biome
pnpm run typecheck    # 对 src 和 test 跑 tsc
pnpm run check        # typecheck + lint + test + test:client + test:remote + build
```

`lib/` 是构建产物，放在仓库里是有意为之：安装时不应当需要构建。产品层面的约定见 [SPEC.md](SPEC.md)，各模块的职责见 [src/](src/) 下的模块契约。

## 已知限制

- 单个 DSH 进程。同一个进程内的写入是协调过的；第二个 DSH 进程编辑同一份 patch 时，可能覆盖行或选择。
- 严格固化。会话的决定只做一次，之后不再修改，空决定也一样。如果某个会话启动时快照记录还不存在，它会保留当时的结果，要给它加配置只能新建会话。

## 许可证

MIT
