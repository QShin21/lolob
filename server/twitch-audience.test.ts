import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TwitchAudienceService, twitchQuestion } from './twitch-audience';

class FakeSocket extends EventEmitter {
  closed = false;
  close() { if (!this.closed) { this.closed = true; this.emit('close'); } }
  message(value: unknown) { this.emit('message', JSON.stringify(value)); }
}
const scopes = ['channel:read:polls', 'channel:read:predictions', 'user:read:chat'];
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides: { scopes?: string[]; userId?: string; apiStatus?: number } = {}) {
  let now = Date.parse('2026-10-22T10:00:00Z');
  const sockets: FakeSocket[] = [], urls: string[] = [], requests: { url: string; method: string; body?: any }[] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); requests.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith('/validate')) return new Response(JSON.stringify({ client_id: 'client12345', user_id: overrides.userId ?? '123', login: 'testchannel', expires_in: 3600, scopes: overrides.scopes ?? scopes }));
    if (overrides.apiStatus) return new Response('{}', { status: overrides.apiStatus });
    if (url.includes('/polls?')) return new Response(JSON.stringify({ data: [{ id: 'poll1', title: '本局胜方', status: 'ACTIVE', started_at: new Date(now).toISOString(), duration: 60, choices: [{ id: 'p1', title: '蓝方', votes: 4 }, { id: 'p2', title: '红方', votes: 6 }] }] }));
    if (url.includes('/predictions?')) return new Response(JSON.stringify({ data: [{ id: 'prediction1', title: '下一条龙', status: 'ACTIVE', created_at: new Date(now).toISOString(), prediction_window: 30, outcomes: [{ id: 'o1', title: '蓝方', users: 2, channel_points: 100 }] }] }));
    return new Response(JSON.stringify({ data: [{ id: 'subscription' }] }), { status: 202 });
  };
  const service = new TwitchAudienceService({ fetch: fetcher as typeof fetch, socket: url => { urls.push(url); const socket = new FakeSocket(); sockets.push(socket); return socket; }, now: () => now });
  async function connect() {
    await service.connect({ clientId: 'client12345', accessToken: 'secretToken12345', broadcasterId: '123' });
    sockets[0].message({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'session1', keepalive_timeout_seconds: 30 } } });
    await flush(); return service.snapshot();
  }
  let eventId = 0;
  function event(type: string, value: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    sockets.at(-1)!.message({ metadata: { message_type: 'notification', message_id: `event${++eventId}`, message_timestamp: new Date(now).toISOString(), ...extra }, payload: { subscription: { type }, event: { broadcaster_user_id: '123', ...value } } });
  }
  return { service, sockets, requests, urls, connect, event, advance: (ms: number) => { now += ms; } };
}

test('Twitch connects using validated read scopes, snapshots omit credentials and all writes only subscribe to events', async t => {
  const f = fixture(); t.after(() => f.service.disconnect()); const state = await f.connect();
  assert.equal(state.status, 'connected'); assert.equal(state.poll!.choices[0].votes, 4); assert.equal(state.prediction!.choices[0].points, 100);
  assert.ok(!JSON.stringify(state).includes('secretToken')); assert.equal(f.requests.filter(r => r.method === 'POST').length, 8);
  assert.ok(f.requests.filter(r => r.method !== 'GET').every(r => r.url === 'https://api.twitch.tv/helix/eventsub/subscriptions'));
  assert.ok(f.requests.filter(r => r.method === 'POST').every(r => r.body.transport.method === 'websocket' && r.body.transport.session_id === 'session1'));
  assert.equal(f.requests.find(r => r.body?.type === 'channel.chat.message')!.body.condition.user_id, '123');
});
test('chat votes accept exact options once per user, ignore repeats and foreign channels, and expire', async t => {
  const f = fixture(); t.after(() => f.service.disconnect()); await f.connect();
  f.service.startVote({ title: '最佳选手', options: ['甲', '乙'], durationSeconds: 10 });
  f.event('channel.chat.message', { chatter_user_id: 'a', message: { text: '1' } });
  f.event('channel.chat.message', { chatter_user_id: 'a', message: { text: '2' } });
  f.event('channel.chat.message', { chatter_user_id: 'b', message: { text: '乙' } });
  f.event('channel.chat.message', { broadcaster_user_id: '999', chatter_user_id: 'c', message: { text: '1' } });
  f.event('channel.chat.message', { chatter_user_id: 'd', message: { text: '支持甲' } });
  assert.deepEqual(f.service.snapshot().chatVote!.choices.map(c => c.votes), [1, 1]); assert.equal(f.service.snapshot().chatVote!.totalVoters, 2);
  f.advance(11000); f.event('channel.chat.message', { chatter_user_id: 'c', message: { text: '1' } });
  assert.equal(f.service.snapshot().chatVote!.status, 'COMPLETED'); assert.equal(f.service.snapshot().chatVote!.totalVoters, 2);
});
test('old chat messages cannot enter a newly started vote and duplicate notifications count once', async t => {
  const f = fixture(); t.after(() => f.service.disconnect()); await f.connect();
  f.service.startVote({ title: '测试', options: ['甲', '乙'], durationSeconds: 60 });
  f.event('channel.chat.message', { chatter_user_id: 'a', message: { text: '1' } }, { message_timestamp: '2026-10-22T09:59:00Z' });
  f.event('channel.chat.message', { chatter_user_id: 'b', message: { text: '1' } }, { message_id: 'duplicate' });
  f.event('channel.chat.message', { chatter_user_id: 'c', message: { text: '1' } }, { message_id: 'duplicate' });
  assert.equal(f.service.snapshot().chatVote!.totalVoters, 1);
});
test('EventSub updates normalize poll total votes and prediction lock/end outcomes', async t => {
  const f = fixture(); t.after(() => f.service.disconnect()); await f.connect();
  f.event('channel.poll.progress', { id: 'poll1', title: '胜方', choices: [{ id: 'p1', title: '甲', total_votes: 42 }] });
  assert.equal(f.service.snapshot().poll!.choices[0].votes, 42);
  f.event('channel.prediction.lock', { id: 'prediction1', title: '龙', outcomes: [{ id: 'o1', title: '甲', users: 5 }] }); assert.equal(f.service.snapshot().prediction!.status, 'LOCKED');
  f.event('channel.prediction.end', { id: 'prediction1', title: '龙', status: 'resolved', winning_outcome_id: 'o1', outcomes: [{ id: 'o1', title: '甲', users: 5 }] }); assert.equal(f.service.snapshot().prediction!.winningChoiceId, 'o1');
});
test('EventSub migrates to Twitch reconnect URL without resubscribing and rejects foreign endpoints', async t => {
  const f = fixture(); t.after(() => f.service.disconnect()); await f.connect(); const countBefore = f.requests.length;
  f.sockets[0].message({ metadata: { message_type: 'session_reconnect' }, payload: { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?session=next' } } });
  assert.equal(f.sockets[0].closed, false); f.sockets[1].message({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'session2', keepalive_timeout_seconds: 30 } } }); await flush();
  assert.equal(f.sockets[0].closed, true); assert.equal(f.requests.length, countBefore);
  f.sockets[1].message({ metadata: { message_type: 'session_reconnect' }, payload: { session: { reconnect_url: 'wss://example.com/ws' } } });
  assert.equal(f.urls.length, 2); assert.equal(f.service.snapshot().status, 'error');
});
test('wrong account, missing permissions and expired API authorization fail without leaking secrets', async () => {
  const wrong = fixture({ userId: '999' }); await assert.rejects(wrong.connect(), /主播本人/); assert.equal(wrong.service.snapshot().status, 'error'); assert.ok(!JSON.stringify(wrong.service.snapshot()).includes('secretToken'));
  const noScope = fixture({ scopes: [] }); await assert.rejects(noScope.connect(), /至少一项/); assert.equal(noScope.sockets.length, 0);
  const unauthorized = fixture({ apiStatus: 401 }); await unauthorized.service.connect({ clientId: 'client12345', accessToken: 'secretToken12345' }); assert.equal(unauthorized.service.snapshot().status, 'error'); assert.equal(unauthorized.sockets.length, 0);
});
test('only granted capabilities subscribe and vote validation rejects duplicate or unavailable options', async t => {
  const f = fixture({ scopes: ['channel:read:polls'] }); t.after(() => f.service.disconnect()); await f.connect();
  assert.equal(f.requests.filter(r => r.method === 'POST').length, 3); assert.throws(() => f.service.startVote({}), /user:read:chat/);
  assert.throws(() => f.service.display('invalid'), /有效/); f.service.display('poll'); assert.equal(f.service.snapshot().display, 'poll');
  const chat = fixture({ scopes: ['user:read:chat'] }); t.after(() => chat.service.disconnect()); await chat.connect();
  assert.throws(() => chat.service.startVote({ title: 'test', options: ['Same', 'same'], durationSeconds: 60 }), /不同选项/);
});
test('malformed external questions are omitted and invalid numeric counts do not corrupt graphic totals', () => {
  assert.equal(twitchQuestion({}, 'poll'), undefined);
  const q = twitchQuestion({ id: 'x', title: '测试', choices: [{ id: 'a', title: '甲', votes: -1 }, { id: 'b', title: '乙', votes: '999' }] }, 'poll');
  assert.deepEqual(q!.choices.map(c => c.votes), [0, 0]);
});
