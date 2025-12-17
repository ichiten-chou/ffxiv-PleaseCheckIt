# PvP Observer

## 🎮 FFXIV PvP 玩家觀察器

一個現代化的網頁應用程式，用於觀察並分析 FFXIV PvP 玩家數據。

![Preview](https://img.shields.io/badge/status-beta-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

### ✨ 功能

- **整體統計** - 顯示所有玩家統計，支援自訂顯示數量 (10-10000人)
- **最近10日** - 按日期分類查看最近 10 天的比賽記錄
- **Tier 分級系統** - 根據 KDA、傷害、場次計算 T0-T5 分級，T0 優先排序
- **現代 UI** - 深色主題、毛玻璃效果、流暢動畫、居中版面
- **本地處理** - 所有資料在瀏覽器本地處理，無需上傳伺服器

### 🚀 使用方式

1. 開啟網頁：[GitHub Pages Link]
2. 點擊「上傳資料」或拖曳 `data.json` 檔案
3. 調整顯示玩家數量 (預設 500)

### 📍 data.db 位置

```
%AppData%\XIVLauncher\pluginConfigs\PvpStats\data.db
```

或

```
C:\Users\[用戶名]\AppData\Roaming\XIVLauncher\pluginConfigs\PvpStats\data.db
```

### 🔄 轉換資料

使用 PowerShell 腳本轉換 data.db 為 JSON：

```powershell
.\tools\convert-db.ps1 -InputPath "你的data.db路徑" -OutputPath ".\data.json"
```

### 📊 Tier 分級說明

| Tier | 百分位 | 說明 |
|------|--------|------|
| T0 | Top 5% | 傳說級玩家 |
| T1 | Top 15% | 菁英玩家 |
| T2 | Top 35% | 優秀玩家 |
| T3 | Top 70% | 普通玩家 |
| T4 | Top 90% | 新手玩家 |
| T5 | Bottom 10% | 初心者 |

### 🛠️ 技術棧

- 純 HTML/CSS/JavaScript
- 無需建置工具
- GitHub Pages 託管

### 📝 更新日誌

#### v2.0.0 (2025-12-17)
- 重新命名為 PvP Observer
- 改進 UI 版面，內容居中顯示
- 支援全部玩家分析（無上限）
- 可自訂顯示數量 (10-10000)
- 修正 Tier 排序問題
- 最近10日比賽按日期分組
- 優化標籤 UX

#### v1.0.0 (2025-12-17)
- 初始版本發布
- 支援 data.db 解析
- 最近500人 / 最近五場功能
- Tier 分級系統

---

Made with ❤️ for FFXIV PvP Community
