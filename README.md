# AlphabetAndThings

一款面向三岁儿童的中英双语字母与常见事物认知小游戏。

- 仓库：https://github.com/KiwiFundHongning/AlphabetAndThings
- GitHub Pages（合并后启用）：https://kiwifundhongning.github.io/AlphabetAndThings/
- 第一阶段字母：A–P、R–U、W、Z（暂不包含 Q、V、X、Y）

## 最简单的游戏入口

在项目最外层双击 **`打开游戏.html`** 即可开始，不需要安装、登录或联网。

要分享给朋友时，只需压缩整个 **`AlphabetAndThings-分享版`** 文件夹。朋友解压后双击其中的 **`打开游戏.html`**，Windows 和 Mac 都会使用默认浏览器运行。请不要只发送单独的 HTML 文件，因为旁边的 `audio` 和 `things` 文件夹包含本地声音和图片。

## 第一阶段体验

- 每轮随机练习 5 个字母，初次显示 2 个大选项。
- 学习时把对应的本地卡通物品图片放大显示在画面中央，色彩饱和但温和。
- 可点击大字母，也可直接按键盘上对应的字母键作答。
- 题目只播放“字母、英文物品、中文物品”的预生成儿童风格读音；字母和英文单词之间保留约 0.8 秒停顿，不播放操作指令。
- 答对后再次显示对应事物、中英文名称、星星动画和声音反馈。
- 游戏使用低音量原创纯音乐《Gentle Ocean Play》，读音播放时会自动降低音乐音量。
- 答错不扣分；连续答错后突出正确字母，帮助孩子完成。
- 长按 3 秒进入家长区，查看每个字母的练习次数和首次正确率。
- 无需注册或登录；学习记录与统计仅保存在每个孩子自己的设备中。
- 不使用账号、服务器数据库、广告、追踪、麦克风或摄像头。
- 所有网页、字体、图片和程序资源都随项目保存，并提供离线缓存。

家长可以把公开游戏链接直接发给朋友。每台设备各自保存进度，设备之间不会互相看到或同步孩子的数据；清除浏览器数据会同时清除该设备上的学习记录。

当前附带语音在开发时使用美式英语儿童音色 `en-US-AnaNeural` 和普通话卡通音色 `zh-CN-XiaoyiNeural` 预生成。游戏只包含短 MP3 文件，游玩时不会下载语言包或连接语音服务。项目仍保留 Apache 2.0 许可的 Kokoro 本地备用生成器。第三方说明见 `THIRD_PARTY_NOTICES.md`。

## 本地运行

普通试玩无需执行下面的开发步骤，直接使用最外层的 `打开游戏.html` 即可。

网页项目位于 `web` 文件夹：

```powershell
cd web
npm install
npm run dev
```

打开 `http://localhost:3000/`。

## 构建与发布

- `npm run build`：生成 Sites 版本。
- `npm run build:pages`：在 `GITHUB_PAGES=true` 环境中生成 GitHub Pages 静态版本。
- `npm run build:portable`：重新生成无需安装的一键分享文件夹。
- GitHub Actions 使用 `/AlphabetAndThings/` 作为 Pages 基础路径，并在 `main` 更新后发布。

当前开发分支为 `feature/initial-game`。未经批准不会合并到 `main`。
