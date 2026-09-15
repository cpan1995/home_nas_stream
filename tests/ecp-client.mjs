import { createHash } from 'node:crypto';

export async function connectEcp(url) {
    const socket = new WebSocket(url, 'ecp-2');
    const pending = new Map();
    let sequence = 0;
    let challengeResolve, challengeReject;
    const challenge = new Promise((resolve, reject) => { challengeResolve = resolve; challengeReject = reject; });
    const timer = setTimeout(() => challengeReject(Error('ECP authentication challenge timed out')), 3000);
    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.notify === 'authenticate') challengeResolve(message['param-challenge']);
        const waiting = pending.get(message['response-id']);
        if (waiting) { pending.delete(message['response-id']); clearTimeout(waiting.timer); waiting.resolve(message); }
    };
    socket.onerror = () => challengeReject(Error('ECP WebSocket connection failed'));
    const request = (name, params = {}) => new Promise((resolve, reject) => {
        const id = String(++sequence);
        const timer = setTimeout(() => { pending.delete(id); reject(Error(`ECP request timed out: ${name}`)); }, 3000);
        pending.set(id, { resolve, timer });
        socket.send(JSON.stringify({ request: name, 'request-id': id, ...params }));
    });
    try {
        const value = await challenge;
        clearTimeout(timer);
        const response = createHash('sha1').update(value + 'F3A278B8-1C6F-44A9-9D89-F1979CA4C6F1').digest('base64');
        if ((await request('authenticate', { 'param-response': response })).status !== '200') throw Error('ECP authentication failed');
        return { request, close: () => socket.close() };
    } catch (error) { clearTimeout(timer); socket.close(); throw error; }
}
