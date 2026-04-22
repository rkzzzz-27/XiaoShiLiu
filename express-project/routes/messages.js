const express = require('express');
const router = express.Router();
const { HTTP_STATUS, RESPONSE_CODES, ERROR_MESSAGES } = require('../constants');
const { pool } = require('../config/config');
const { authenticateToken } = require('../middleware/auth');
const { success, error, handleError } = require('../utils/responseHelper');

// 发送消息
router.post('/messages', authenticateToken, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { receiver_id, content } = req.body;

    if (!receiver_id || !content || content.trim() === '') {
      return error(res, '接收者ID和消息内容不能为空', RESPONSE_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
    }

    // 检查接收者是否存在
    const [receiverRows] = await pool.execute(
      'SELECT id FROM users WHERE id = ? AND is_active = 1',
      [receiver_id]
    );

    if (receiverRows.length === 0) {
      return error(res, '接收者不存在', RESPONSE_CODES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    // 不能给自己发消息
    if (senderId === parseInt(receiver_id)) {
      return error(res, '不能给自己发送消息', RESPONSE_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
    }

    // 插入消息
    const [result] = await pool.execute(
      'INSERT INTO messages (sender_id, receiver_id, content, is_read) VALUES (?, ?, ?, 0)',
      [senderId, receiver_id, content.trim()]
    );

    // 获取刚插入的消息
    const [messageRows] = await pool.execute(
      `SELECT m.*,
        s.user_id as sender_user_id, s.nickname as sender_nickname, s.avatar as sender_avatar,
        r.user_id as receiver_user_id, r.nickname as receiver_nickname, r.avatar as receiver_avatar
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      JOIN users r ON m.receiver_id = r.id
      WHERE m.id = ?`,
      [result.insertId]
    );

    success(res, messageRows[0], '发送成功');
  } catch (err) {
    handleError(err, res, '发送消息');
  }
});

// 获取未读消息总数
router.get('/messages/unread/count', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const [result] = await pool.execute(
      'SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0',
      [currentUserId]
    );

    success(res, { count: parseInt(result[0].count || 0) });
  } catch (err) {
    handleError(err, res, '获取未读消息数');
  }
});

// 获取与某用户的聊天记录
router.get('/messages/:userId', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = parseInt(req.params.userId, 10);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
      return error(res, '无效的用户ID', RESPONSE_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
    }

    // 获取双方的消息
    const [rows] = await pool.execute(
      `SELECT m.*,
        s.user_id as sender_user_id, s.nickname as sender_nickname, s.avatar as sender_avatar,
        r.user_id as receiver_user_id, r.nickname as receiver_nickname, r.avatar as receiver_avatar
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      JOIN users r ON m.receiver_id = r.id
      WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?`,
      [currentUserId, otherUserId, otherUserId, currentUserId, limit.toString(), offset.toString()]
    );

    // 获取对方信息
    const [otherUserRows] = await pool.execute(
      'SELECT id, user_id, nickname, avatar FROM users WHERE id = ? AND is_active = 1',
      [otherUserId]
    );

    // 获取总数
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM messages
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)`,
      [currentUserId, otherUserId, otherUserId, currentUserId]
    );

    // 标记对方发送的消息为已读
    await pool.execute(
      'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
      [otherUserId, currentUserId]
    );

    success(res, {
      messages: rows.reverse(), // 按时间正序返回
      otherUser: otherUserRows[0] || null,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        pages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch (err) {
    handleError(err, res, '获取聊天记录');
  }
});

// 获取聊天列表（最近联系人）
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    // 获取最近有消息往来的用户列表，包含最新消息和未读数
    const [rows] = await pool.execute(
      `SELECT
        other_user.id as contact_id,
        other_user.user_id as contact_user_id,
        other_user.nickname as contact_nickname,
        other_user.avatar as contact_avatar,
        latest_msg.content as last_message,
        latest_msg.created_at as last_message_time,
        latest_msg.sender_id as last_message_sender_id,
        IFNULL(unread.count, 0) as unread_count
      FROM (
        -- 获取每个联系人的最新消息
        SELECT
          CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as contact_id,
          MAX(id) as latest_msg_id
        FROM messages
        WHERE sender_id = ? OR receiver_id = ?
        GROUP BY contact_id
      ) contacts
      JOIN messages latest_msg ON latest_msg.id = contacts.latest_msg_id
      JOIN users other_user ON other_user.id = contacts.contact_id
      LEFT JOIN (
        SELECT sender_id, COUNT(*) as count
        FROM messages
        WHERE receiver_id = ? AND is_read = 0
        GROUP BY sender_id
      ) unread ON unread.sender_id = contacts.contact_id
      ORDER BY latest_msg.created_at DESC`,
      [currentUserId, currentUserId, currentUserId, currentUserId]
    );

    success(res, rows);
  } catch (err) {
    handleError(err, res, '获取聊天列表');
  }
});

// 标记与某用户的所有消息为已读
router.put('/messages/:userId/read', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = parseInt(req.params.userId, 10);

    if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
      return error(res, '无效的用户ID', RESPONSE_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
    }

    await pool.execute(
      'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
      [otherUserId, currentUserId]
    );

    success(res, null, '标记已读成功');
  } catch (err) {
    handleError(err, res, '标记已读');
  }
});

// 删除单条消息
router.delete('/messages/:id', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const messageId = req.params.id;

    // 验证消息是否属于当前用户
    const [rows] = await pool.execute(
      'SELECT id FROM messages WHERE id = ? AND (sender_id = ? OR receiver_id = ?)',
      [messageId, currentUserId, currentUserId]
    );

    if (rows.length === 0) {
      return error(res, '消息不存在', RESPONSE_CODES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    await pool.execute('DELETE FROM messages WHERE id = ?', [messageId]);

    success(res, null, '删除成功');
  } catch (err) {
    handleError(err, res, '删除消息');
  }
});

module.exports = router;
