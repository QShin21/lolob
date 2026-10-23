# 自定义浏览器图层与制作接口

在“连接与输出 → 数据集成”生成数据接口密钥。网页位于另一域名时，将网页来源加入允许列表，例如 `https://graphics.example.com`。跨主机读取需在导播主机启用局域网模式并使用该主机地址。

## 数据客户端

```html
<script type="module">
import { RiftCastClient } from 'http://127.0.0.1:3888/riftcast-client.js';
const client = new RiftCastClient({ baseUrl: 'http://127.0.0.1:3888', key: '在此填写数据接口密钥' });
const unsubscribe = client.subscribe(data => {
  // 使用 textContent 渲染名称，空值保留为待采集。
  document.querySelector('#title').textContent = data.match.title;
}, error => console.warn(error.message));
window.addEventListener('pagehide', () => client.close());
</script>
<h1 id="title"></h1>
```

JSON 快照接口为 `GET /api/integrations/data`，请求头为 `Authorization: Bearer <密钥>`；事件流接口为 `GET /api/integrations/stream?key=<密钥>`。事件名 `game-data`，最多每秒 4 次，15 秒心跳。连接中断由 EventSource 自动重连。更换密钥后旧订阅需要更新密钥。

`schemaVersion: 1` 返回已播节目的 `match`、`teams`、`players`、`stats`、`events`、`economy`、`draft`、`neutralObjectives`、`fightSegment`、`gameClock`、`programScene`、`revision` 和 `generatedAt`。完整 TypeScript 结构见 [shared/integrations.ts](../shared/integrations.ts)。数据可用性沿用字段中的采样时刻、来源和有效期；累计经济及伤害缺测使用空值。

## 浏览器图层

在“导播台 → 场景库 → 自定义场景”添加“网页 / 浏览器源”，填写 HTTP(S) 页面地址。调整图层顺序、位置和尺寸后保存到预监，核对画面再 TAKE。网页源默认静音，独立预监和节目实例各自保留布局。

## Webhook

支持 `game.event`、`game.changed`、`phase.changed`、`program.changed`、`result.saved`。正文包含 `schemaVersion`、`id`、`event`、`at`、`production` 和 `data`。每次投递携带：

- `X-RiftCast-Delivery`：接收端按此值去重。
- `X-RiftCast-Event`：事件类型。
- `X-RiftCast-Timestamp`：Unix 秒时间戳。
- `X-RiftCast-Signature`：`sha256=` 加 HMAC-SHA256 十六进制值；签名内容为时间戳、英文句点、原始请求正文的连接。

接收端验证签名和时间窗后返回 2xx。发送超时为 5 秒，失败最多尝试 3 次，内存队列最多 200 项，最近回执保留 100 条；重启后队列重新建立。启动、换局和回放跳转会重建基线，历史事件不会作为实时击杀发送。
