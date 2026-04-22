const express = require('express');
const router = express.Router();
const { pool } = require('../config/config');
const { authenticateToken } = require('../middleware/auth');
const { HTTP_STATUS, RESPONSE_CODES } = require('../constants');
const { success, error } = require('../utils/responseHelper');

router.get('/read-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.execute(`
      SELECT
        c.id AS category_id,
        MAX(p.created_at) AS latest_post_at,
        rs.last_read_at,
        CASE
          WHEN MAX(p.created_at) IS NOT NULL
            AND (rs.last_read_at IS NULL OR MAX(p.created_at) > rs.last_read_at)
          THEN 1
          ELSE 0
        END AS has_unread
      FROM categories c
      LEFT JOIN posts p
        ON p.category_id = c.id
        AND p.status = 0
      LEFT JOIN category_read_states rs
        ON rs.category_id = c.id
        AND rs.user_id = ?
      GROUP BY c.id, rs.last_read_at
      ORDER BY c.id ASC
    `, [userId.toString()]);

    success(res, rows, '获取分类未读状态成功');
  } catch (err) {
    console.error('获取分类未读状态失败:', err);
    error(res, '获取分类未读状态失败');
  }
});

router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const categoryId = parseInt(req.params.id, 10);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        code: RESPONSE_CODES.VALIDATION_ERROR,
        message: '无效的分类ID'
      });
    }

    const [categoryRows] = await pool.execute(
      'SELECT id FROM categories WHERE id = ? LIMIT 1',
      [categoryId.toString()]
    );

    if (categoryRows.length === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        code: RESPONSE_CODES.NOT_FOUND,
        message: '分类不存在'
      });
    }

    const [latestRows] = await pool.execute(
      'SELECT MAX(created_at) AS latest_post_at FROM posts WHERE category_id = ? AND status = 0',
      [categoryId.toString()]
    );

    const latestPostAt = latestRows[0]?.latest_post_at || new Date();

    await pool.execute(`
      INSERT INTO category_read_states (user_id, category_id, last_read_at)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        last_read_at = VALUES(last_read_at),
        updated_at = CURRENT_TIMESTAMP
    `, [userId.toString(), categoryId.toString(), latestPostAt]);

    success(res, {
      category_id: categoryId,
      last_read_at: latestPostAt
    }, '分类已读状态更新成功');
  } catch (err) {
    console.error('更新分类已读状态失败:', err);
    error(res, '更新分类已读状态失败');
  }
});

/**
 * @api {get} /api/categories 获取分类列表
 * @apiName GetCategories
 * @apiGroup Categories
 * @apiDescription 获取所有分类列表
 * 
 * @apiSuccess {Number} code 状态码
 * @apiSuccess {String} message 响应消息
 * @apiSuccess {Array} data 分类列表
 * @apiSuccess {Number} data.id 分类ID
 * @apiSuccess {String} data.name 分类名称
 * 
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *       "code": 200,
 *       "message": "获取成功",
 *       "data": [
 *         {
 *           "id": 1,
 *           "name": "推荐"
 *         },
 *         {
 *           "id": 2,
 *           "name": "学习"
 *         }
 *       ]
 *     }
 */
router.get('/', async (req, res) => {
  try {
    const { sortField = 'id', sortOrder = 'asc', name, category_title } = req.query;

    const allowedSortFields = {
      'id': 'c.id',
      'name': 'c.name',
      'created_at': 'c.created_at',
      'post_count': 'post_count'
    };
    const allowedSortOrders = {
      'asc': 'ASC',
      'desc': 'DESC'
    };
    const validSortField = allowedSortFields[sortField] || allowedSortFields['id'];
    const validSortOrder = allowedSortOrders[sortOrder?.toLowerCase()] || allowedSortOrders['asc'];

    // 构建WHERE条件
    const queryParams = [];
    const conditions = [];

    if (name && typeof name === 'string' && name.trim()) {
      conditions.push('c.name LIKE ?');
      queryParams.push(`%${name.trim()}%`);
    }

    if (category_title && typeof category_title === 'string' && category_title.trim()) {
      conditions.push('c.category_title LIKE ?');
      queryParams.push(`%${category_title.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const [categories] = await pool.execute(`
      SELECT 
        c.id, 
        c.name, 
        c.category_title,
        c.created_at,
        COUNT(p.id) as post_count
      FROM categories c
      LEFT JOIN posts p ON c.id = p.category_id
      ${whereClause}
      GROUP BY c.id, c.name, c.category_title, c.created_at
      ORDER BY ${validSortField} ${validSortOrder}
    `, queryParams)

    success(res, categories, '获取成功');
  } catch (err) {
    console.error('获取分类列表失败:', err);
    error(res, '获取分类列表失败');
  }
});
module.exports = router;
