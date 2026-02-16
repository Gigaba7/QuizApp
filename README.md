# Quiz Sync（Firebase Realtime Database）

指定仕様の静的Webアプリです（ビルド不要）。

## ファイル構成

- `index.html` … ホーム（ルーム作成/参加）
- `room.html` … ホスト操作画面（スコア・タイマー管理）
- `config.html` … 参加者の表示設定（room不要 / localStorage）
- `overlay.html` … OBS表示専用（表示のみ / 背景透過）
- `style.css`
- `app.js`
- `firebaseConfig.js`

## 重要仕様（守っている点）

- **タイマー残り秒を毎秒Firebaseに書き込みません**  
  `duration` と `startedAt` から各クライアントで残り時間を計算します。
- **レイアウトはFirebaseに保存しません**（`localStorage` のみ）
- **参加者は room 未参加でも `config.html` でレイアウトを事前設定可能**
- overlayは操作UIなし（表示専用）
- ドラッグ配置なし（上下左右固定のみ）

## 使い方

### 1) Firebase設定

`firebaseConfig.js` の `YOUR_*` を Firebase Console の値で置き換えてください。

### 2) 事前（参加者）

- `config.html` を開き、表示名/色/アイコン/レイアウトを保存
- `overlay.html?room=test` でダミー表示の配置を調整
- 当日は overlay URL の `room` を本番IDに変更

### 3) 当日（ホスト）

- `index.html` → 「ルームを作成」 → `room.html?room=123456`
- 参加者が overlay を開くと `players` に登録され、ホスト画面に一覧表示されます

## localStorage キー

- ユーザーID: `gigaba_overlay_user_id`
- レイアウト: `layout_{userId}`
- プロフィール: `profile_{userId}`

## Realtime Database パス

```
rooms/{roomId}
  hostId: string
  timer:
    duration: number
    startedAt: number
    running: boolean
  players:
    {uid}:
      name: string
      score: number
      color: string
      icon: string
```

## 参考: DBルール（例）

本アプリはログイン無し（匿名UUID）なので、実運用は必ずルール設計が必要です。ここでは例のみ。

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

