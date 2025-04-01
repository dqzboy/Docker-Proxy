/**
 * 通知服务
 * 用于发送各种类型的通知
 */
const axios = require('axios');
const logger = require('../logger');

/**
 * 发送通知
 * @param {Object} message - 消息对象，包含标题、内容等
 * @param {Object} config - 配置对象，包含通知类型和相关配置
 * @returns {Promise<void>}
 */
async function sendNotification(message, config) {
    const { type } = config;
    
    switch (type) {
        case 'wechat':
            return sendWechatNotification(message, config);
        case 'telegram':
            return sendTelegramNotification(message, config);
        default:
            throw new Error(`不支持的通知类型: ${type}`);
    }
}

/**
 * 发送企业微信通知
 * @param {Object} message - 消息对象
 * @param {Object} config - 配置对象
 * @returns {Promise<void>}
 */
async function sendWechatNotification(message, config) {
    const { webhookUrl } = config;
    
    if (!webhookUrl) {
        throw new Error('企业微信 Webhook URL 未配置');
    }
    
    const payload = {
        msgtype: 'markdown',
        markdown: {
            content: `## ${message.title}\n${message.content}\n> ${message.time}`
        }
    };
    
    try {
        const response = await axios.post(webhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
        });
        
        if (response.status !== 200 || response.data.errcode !== 0) {
            throw new Error(`企业微信返回错误: ${response.data.errmsg || '未知错误'}`);
        }
        
        logger.info('企业微信通知发送成功');
    } catch (error) {
        logger.error('企业微信通知发送失败:', error);
        throw new Error(`企业微信通知发送失败: ${error.message}`);
    }
}

/**
 * 发送Telegram通知
 * @param {Object} message - 消息对象
 * @param {Object} config - 配置对象
 * @returns {Promise<void>}
 */
async function sendTelegramNotification(message, config) {
    const { telegramToken, telegramChatId } = config;
    
    if (!telegramToken || !telegramChatId) {
        throw new Error('Telegram Token 或 Chat ID 未配置');
    }
    
    const text = `*${message.title}*\n\n${message.content}\n\n_${message.time}_`;
    const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
    
    try {
        const response = await axios.post(url, {
            chat_id: telegramChatId,
            text: text,
            parse_mode: 'Markdown'
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
        });
        
        if (response.status !== 200 || !response.data.ok) {
            throw new Error(`Telegram 返回错误: ${response.data.description || '未知错误'}`);
        }
        
        logger.info('Telegram 通知发送成功');
    } catch (error) {
        logger.error('Telegram 通知发送失败:', error);
        throw new Error(`Telegram 通知发送失败: ${error.message}`);
    }
}

module.exports = {
    sendNotification
};
