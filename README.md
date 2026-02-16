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

### 1.5) Authentication（匿名）を有効化（ホスト専用操作のため推奨）

ホストだけがタイマー/スコアを書き込めるようにするため、Firebase Console で匿名認証を有効化してください。

- Firebase Console → **Authentication** → **Sign-in method** → **Anonymous** を有効化

### 2) 事前（参加者）

- `config.html` を開き、表示名/色/アイコン/レイアウトを保存
- `overlay.html?room=test` で表示配置を調整（テスト用）
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

本アプリはUIログイン無しですが、**匿名認証（Anonymous）** を内部で使用できます。実運用は必ずルール設計が必要です。ここでは例のみ。

### デバッグ用（非推奨・全開放）

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

### 推奨（ホストだけ timer/score 操作）

- ルーム作成: 認証済みユーザーなら作成可（`hostId === auth.uid` 必須）
- タイマー: `hostId` のユーザーだけ書き込み可
- スコア: `hostId` のユーザーだけ `players/{uid}/score` 書き込み可
- プレイヤー情報（name/color/icon）: 各ユーザーが自分の `authUid` と一致する場合のみ更新可

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": "auth != null && !data.exists() && newData.child('hostId').val() === auth.uid",
        "hostId": {
          ".write": "auth != null && !data.exists() && newData.isString() && newData.val() === auth.uid"
        },
        "timer": {
          ".read": true,
          ".write": "auth != null && auth.uid === root.child('rooms/' + $roomId + '/hostId').val()",
          "duration": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 86400" },
          "startedAt": { ".validate": "newData.isNumber() && newData.val() >= 0" },
          "running": { ".validate": "newData.isBoolean()" }
        },
        "players": {
          "$uid": {
            ".read": true,
            ".write": "auth != null && !data.exists() && newData.child('authUid').val() === auth.uid",
            "authUid": {
              ".write": "auth != null && ( (!data.exists() && newData.val() === auth.uid) || (data.exists() && data.val() === auth.uid && newData.val() === auth.uid) )",
              ".validate": "newData.isString()"
            },
            "name": {
              ".write": "auth != null && root.child('rooms/' + $roomId + '/players/' + $uid + '/authUid').val() === auth.uid",
              ".validate": "newData.isString() && newData.val().length <= 24"
            },
            "color": {
              ".write": "auth != null && root.child('rooms/' + $roomId + '/players/' + $uid + '/authUid').val() === auth.uid",
              ".validate": "newData.isString()"
            },
            "icon": {
              ".write": "auth != null && root.child('rooms/' + $roomId + '/players/' + $uid + '/authUid').val() === auth.uid",
              ".validate": "newData.isString() && newData.val().length <= 6"
            },
            "score": {
              ".write": "auth != null && auth.uid === root.child('rooms/' + $roomId + '/hostId').val()",
              ".validate": "newData.isNumber()"
            },
            "$other": { ".validate": false }
          }
        },
        "$other": { ".write": false }
      }
    }
  }
}
```
