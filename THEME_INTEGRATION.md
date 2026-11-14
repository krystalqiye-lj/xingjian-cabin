# 接入新主题

每个主题保持自己的 SillyTavern 扩展和 Git 仓库，仓库根目录放 `manifest.json`。仓库名也是用链接安装时生成的扩展目录名。

1. 在新扩展的清单里加上 `"scenic_theme": { "id": "your-theme", "label": "你的主题名", "order": 30 }`。用唯一且稳定的小写 ID，按钮会按 `order` 排序。
2. 复用 [theme-choice.js](theme-choice.js)。与本扩展一样，在酒馆的 `APP_INITIALIZED` 事件里，先检查 `activeTheme() === 'your-theme'`，再挂载界面。给新主题的样式加专属作用域。
3. 在新主题的设置区，用 `availableThemes()` 列出其它已启用的主题，点击时调用 `switchTheme(id)`。新主题安装启用后，原有主题的切换菜单会自动显示它。

当前选择保存在浏览器的 `tavern-scenic-theme`。主题未安装或停用时，刷新会选择其它可用主题。林间拾叶和星间的原有 ID 是 `forest` 和 `xingjian`。
