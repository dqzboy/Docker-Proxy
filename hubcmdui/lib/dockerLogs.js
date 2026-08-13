'use strict';

const { Transform } = require('stream');

const DOCKER_HEADER_SIZE = 8;
const MAX_FRAME_SIZE = 64 * 1024 * 1024;

function isDockerFrameHeader(buffer, offset = 0) {
  if (!Buffer.isBuffer(buffer) || buffer.length - offset < DOCKER_HEADER_SIZE) return false;

  const streamType = buffer[offset];
  return streamType <= 2 &&
    buffer[offset + 1] === 0 &&
    buffer[offset + 2] === 0 &&
    buffer[offset + 3] === 0;
}

function sanitizeLogText(value) {
  return String(value == null ? '' : value)
    // OSC: 设置终端标题、超链接等，以 BEL 或 ST 结束。
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    // CSI: 颜色、光标移动、清屏等常见 ANSI 控制序列。
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    // 保留换行、回车和 Tab；清掉其余 C0/DEL 控制字符。
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function decodeDockerLogBuffer(value, { tty = false } = {}) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || '');
  if (tty || buffer.length < DOCKER_HEADER_SIZE || !isDockerFrameHeader(buffer)) {
    return sanitizeLogText(buffer.toString('utf8'));
  }

  const payloads = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (!isDockerFrameHeader(buffer, offset)) {
      // 某些 Docker 兼容实现即便 TTY=false 也可能返回原始文本；完整回退，避免吞掉日志。
      return sanitizeLogText(buffer.toString('utf8'));
    }

    const payloadLength = buffer.readUInt32BE(offset + 4);
    if (payloadLength > MAX_FRAME_SIZE) {
      return sanitizeLogText(buffer.toString('utf8'));
    }

    const payloadStart = offset + DOCKER_HEADER_SIZE;
    const payloadEnd = payloadStart + payloadLength;
    if (payloadEnd > buffer.length) {
      return sanitizeLogText(buffer.toString('utf8'));
    }

    payloads.push(buffer.subarray(payloadStart, payloadEnd));
    offset = payloadEnd;
  }

  return sanitizeLogText(Buffer.concat(payloads).toString('utf8'));
}

/**
 * 将 Docker 非 TTY 日志流的 stdout/stderr multiplexed frame 解包为纯 payload。
 * 输出仍是 Buffer，调用方可用 StringDecoder 安全处理跨 chunk 的 UTF-8 字符。
 */
class DockerLogDemuxStream extends Transform {
  constructor({ tty = false } = {}) {
    super();
    this.tty = tty;
    this.pending = Buffer.alloc(0);
    this.rawMode = tty;
    this.framesSeen = 0;
  }

  _transform(chunk, encoding, callback) {
    try {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
      if (this.rawMode) {
        this.push(data);
        return callback();
      }

      this.pending = this.pending.length ? Buffer.concat([this.pending, data]) : data;

      while (this.pending.length >= DOCKER_HEADER_SIZE) {
        if (!isDockerFrameHeader(this.pending)) {
          if (this.framesSeen === 0) {
            // 兼容返回原始文本的 Docker API 实现。
            this.rawMode = true;
            this.push(this.pending);
            this.pending = Buffer.alloc(0);
            return callback();
          }
          return callback(new Error('Docker 日志流包含无效的复用帧头'));
        }

        const payloadLength = this.pending.readUInt32BE(4);
        if (payloadLength > MAX_FRAME_SIZE) {
          return callback(new Error(`Docker 日志帧过大: ${payloadLength} bytes`));
        }

        const frameLength = DOCKER_HEADER_SIZE + payloadLength;
        if (this.pending.length < frameLength) break;

        this.push(this.pending.subarray(DOCKER_HEADER_SIZE, frameLength));
        this.pending = this.pending.subarray(frameLength);
        this.framesSeen += 1;
      }

      callback();
    } catch (error) {
      callback(error);
    }
  }

  _flush(callback) {
    if (this.rawMode && this.pending.length) {
      this.push(this.pending);
      this.pending = Buffer.alloc(0);
      return callback();
    }

    if (this.pending.length === 0) return callback();

    if (this.framesSeen === 0) {
      // 不足 8 字节且从未出现有效帧，按原始文本返回。
      this.push(this.pending);
      this.pending = Buffer.alloc(0);
      return callback();
    }

    callback(new Error('Docker 日志流在帧结束前中断'));
  }
}

function createDockerLogDemuxStream(options) {
  return new DockerLogDemuxStream(options);
}

module.exports = {
  decodeDockerLogBuffer,
  createDockerLogDemuxStream,
  sanitizeLogText
};
