const express = require('express');
const router = express.Router();
const fs = require('fs');
const { validateImageFile, validateVideoFile } = require('../utils/fileHelpers');
const { HTTP_STATUS, RESPONSE_CODES } = require('../constants');

router.get('/images/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const result = await validateImageFile(filename);

    if (!result.valid) {
      return res.status(result.statusCode).json({
        code: result.statusCode,
        message: '文件访问失败'
      });
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', result.fileSize);
    res.setHeader('Cache-Control', 'public, max-age=31536000');

    const fileStream = fs.createReadStream(result.filePath);
    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      console.error('文件读取错误:', err);
      if (!res.headersSent) {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
          code: RESPONSE_CODES.ERROR,
          message: '文件读取失败'
        });
      } else {
        res.destroy(err);
      }
      fileStream.destroy();
    });

    fileStream.on('close', () => {
      fileStream.destroy();
    });

    res.on('close', () => {
      fileStream.destroy();
    });
  } catch (error) {
    console.error('图片访问错误:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      code: RESPONSE_CODES.ERROR,
      message: '服务器错误'
    });
  }
});

router.get('/videos/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const result = await validateVideoFile(filename);

    if (!result.valid) {
      return res.status(result.statusCode).json({
        code: result.statusCode,
        message: '文件访问失败'
      });
    }

    const range = req.headers.range;
    const fileSize = result.fileSize;

    // 支持 Range 请求以便视频可在线播放和跳转
    let fileStream;
    try {
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
          return res.end();
        }

        const chunkSize = (end - start) + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': result.contentType,
          'Cache-Control': 'public, max-age=31536000'
        });

        fileStream = fs.createReadStream(result.filePath, { start, end });
        fileStream.pipe(res);
      } else {
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Length', fileSize);
        res.setHeader('Cache-Control', 'public, max-age=31536000');

        fileStream = fs.createReadStream(result.filePath);
        fileStream.pipe(res);
      }
    } catch (err) {
      console.error('创建文件流失败:', err);
      if (!res.headersSent) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ code: RESPONSE_CODES.ERROR, message: '文件读取失败' });
      }
      return res.end();
    }

    if (fileStream) {
      fileStream.on('error', (err) => {
        console.error('文件读取错误:', err);
        if (!res.headersSent) {
          res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            code: RESPONSE_CODES.ERROR,
            message: '文件读取失败'
          });
        } else {
          try { res.destroy(err); } catch (e) { }
        }
        try { fileStream.destroy(); } catch (e) { }
      });

      fileStream.on('close', () => {
        try { fileStream.destroy(); } catch (e) { }
      });

      res.on('close', () => {
        try { fileStream.destroy(); } catch (e) { }
      });
    }
  } catch (error) {
    console.error('视频访问错误:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      code: RESPONSE_CODES.ERROR,
      message: '服务器错误'
    });
  }
});

module.exports = router;
