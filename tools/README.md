# PvpStats 資料庫轉換工具

將 PvpStats 插件的 LiteDB 資料庫轉換成 JSON 格式，供網頁應用使用。

## 🚀 快速開始

### 最簡單的方式：拖曳轉換 ⭐

1. 找到你的 `data.db` 檔案：
   ```
   %APPDATA%\XIVLauncher\pluginConfigs\PvpStats\data.db
   ```

2. 直接把 `data.db` **拖曳到** `convert.bat` 圖示上

3. 等待轉換完成，會生成 `data.json`

4. 將 `data.json` 上傳到網頁應用

### 雙擊執行（使用預設路徑）

如果你的資料庫在預設位置，可以直接雙擊 `convert.bat`。

## 📁 檔案說明

| 檔案 | 說明 |
|------|------|
| `convert.bat` | 批次檔，支援拖曳和雙擊執行 |
| `convert-db-v2.ps1` | 改進版 PowerShell 轉換腳本 |
| `convert-db.ps1` | 原始版本（已被 v2 取代） |

## ✨ 主要功能

- ✅ **拖曳支援** - 直接拖曳 `.db` 檔案到 `convert.bat`
- ✅ **自動處理檔案鎖定** - 即使遊戲正在執行也能轉換
- ✅ **清楚的錯誤訊息** - 提供詳細的問題診斷和解決方案
- ✅ **UTF-8 編碼** - 正確處理中文字符

## ⚠️ 重要提醒

### ✅ 使用 `data.db`（正確）
- 這是主要的資料庫檔案
- 包含所有對戰記錄
- **可以正常轉換**

### ❌ 不要使用 `data-log.db`（錯誤）
- 這個檔案使用不同的格式
- **無法用此工具轉換**
- 如果看到錯誤，請確認你使用的是 `data.db`

## 🛠️ 使用方法

### 方法 1：拖曳檔案（推薦）
```
把 data.db 拖曳到 convert.bat 上 → 完成！
```

### 方法 2：雙擊執行
```
雙擊 convert.bat → 自動使用預設路徑
```

### 方法 3：PowerShell 手動執行
```powershell
# 使用預設路徑
.\convert-db-v2.ps1

# 指定自訂路徑
.\convert-db-v2.ps1 -InputPath "C:\path\to\data.db" -OutputPath "output.json"
```

## 📤 輸出格式

轉換後會生成 `data.json`，包含：

```json
{
  "exportTime": "2025-12-18T05:00:00+08:00",
  "flmatch": [
    {
      "MatchStartTime": "2025-12-17T20:15:30",
      "Players": [...],
      "Teams": [...]
    }
  ]
}
```

## ❓ 疑難排解

### 錯誤：File is not a valid LiteDB database

**原因：** 你可能使用了 `data-log.db` 而不是 `data.db`

**解決方案：**
1. 確認使用正確的檔案：`data.db`（不是 data-log.db）
2. 檔案位置：`%APPDATA%\XIVLauncher\pluginConfigs\PvpStats\data.db`

### 找不到 LiteDB.dll

**解決方案：**
確認 PvpStats 插件已正確安裝在：
```
%APPDATA%\XIVLauncher\installedPlugins\PvpStats\
```

### 檔案被鎖定

**不用擔心！** v2 腳本會自動處理：
- 建立資料庫的臨時副本
- 從副本讀取資料
- 轉換完成後自動清理
- **不需要關閉遊戲就能轉換**

## 💡 提示

- 轉換工具會自動處理檔案鎖定問題
- 即使遊戲正在執行也能轉換
- 轉換完成後會顯示檔案大小
- 生成的 JSON 檔案可以直接上傳到網頁

## 🎯 總結

**最佳實踐：**
1. ✅ 找到 `data.db`（在 `%APPDATA%\XIVLauncher\pluginConfigs\PvpStats\`）
2. ✅ 拖曳到 `convert.bat`
3. ✅ 等待轉換完成
4. ✅ 上傳 `data.json` 到網頁

**避免：**
- ❌ 不要使用 `data-log.db`
- ❌ 不要手動編輯資料庫檔案
