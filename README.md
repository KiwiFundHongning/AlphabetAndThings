# AlphabetAndThings

一款面向三岁儿童的中英双语字母与常见事物认知小游戏。

- 仓库：https://github.com/KiwiFundHongning/AlphabetAndThings
- GitHub Pages（合并后启用）：https://kiwifundhongning.github.io/AlphabetAndThings/
- 第一阶段字母：A–P、R–U、W、Z（暂不包含 Q、V、X、Y）

## 第一阶段体验

- 每轮随机练习 5 个字母，初次显示 2 个大选项。
- 学习时同时显示字母和对应的本地卡通物品图片，色彩饱和但温和。
- 可点击大字母，也可直接按键盘上对应的字母键作答。
- 答对后再次显示对应事物、中英文名称、星星动画和声音反馈。
- 答错不扣分；连续答错后突出正确字母，帮助孩子完成。
- 长按 3 秒进入家长区，查看每个字母的练习次数和首次正确率。
- 无需注册或登录；学习记录与统计仅保存在每个孩子自己的设备中。
- 不使用账号、服务器数据库、广告、追踪、麦克风或摄像头。
- 所有网页、字体、图片和程序资源都随项目保存，并提供离线缓存。

家长可以把公开游戏链接直接发给朋友。每台设备各自保存进度，设备之间不会互相看到或同步孩子的数据；清除浏览器数据会同时清除该设备上的学习记录。

第一阶段语音使用设备本地的童声风格合成语音，已预留后续替换为预生成语音文件的空间。

## 本地运行

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
- GitHub Actions 使用 `/AlphabetAndThings/` 作为 Pages 基础路径，并在 `main` 更新后发布。

当前开发分支为 `feature/initial-game`。未经批准不会合并到 `main`。
