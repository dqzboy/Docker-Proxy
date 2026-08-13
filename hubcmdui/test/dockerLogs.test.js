'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { once } = require('node:events');
const {
  decodeDockerLogBuffer,
  createDockerLogDemuxStream,
  sanitizeLogText
} = require('../lib/dockerLogs');

function frame(streamType, payload) {
  const body = Buffer.from(payload);
  const header = Buffer.alloc(8);
  header[0] = streamType;
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

test('解复用多段 stdout/stderr 并保留原始顺序与中文', () => {
  const logs = Buffer.concat([
    frame(2, '错误：连接失败\n'),
    frame(1, '服务已启动 ✅\n')
  ]);

  assert.equal(
    decodeDockerLogBuffer(logs),
    '错误：连接失败\n服务已启动 ✅\n'
  );
});

test('TTY 和纯文本日志不会被误删前 8 个字节', () => {
  const logs = Buffer.from('2026/08/13 nginx started\n');
  assert.equal(decodeDockerLogBuffer(logs, { tty: true }), logs.toString());
  assert.equal(decodeDockerLogBuffer(logs), logs.toString());
});

test('移除 ANSI 和不可打印控制字符但保留换行与 Tab', () => {
  assert.equal(
    sanitizeLogText('\x1b[31mERROR\x1b[0m\x02\t详情\n'),
    'ERROR\t详情\n'
  );
});

test('流式解复用支持帧头、payload 和 UTF-8 字符跨 chunk', async () => {
  const source = Buffer.concat([
    frame(1, '中文日志\n'),
    frame(2, 'stderr 日志\n')
  ]);
  const demux = createDockerLogDemuxStream();
  const output = [];
  demux.on('data', chunk => output.push(chunk));

  // 刻意切在帧头及中文 UTF-8 字节内部。
  for (const [start, end] of [[0, 3], [3, 11], [11, 15], [15, 21], [21, source.length]]) {
    demux.write(source.subarray(start, end));
  }
  demux.end();
  await once(demux, 'end');

  assert.equal(Buffer.concat(output).toString('utf8'), '中文日志\nstderr 日志\n');
});

test('流式处理兼容 Docker API 返回的原始文本', async () => {
  const demux = createDockerLogDemuxStream();
  const output = [];
  demux.on('data', chunk => output.push(chunk));
  demux.end(Buffer.from('plain log\n'));
  await once(demux, 'end');
  assert.equal(Buffer.concat(output).toString('utf8'), 'plain log\n');
});
