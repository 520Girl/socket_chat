/**
 * 文件上传服务
 * 处理图片、语音等多媒体文件的上传和存储
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const baseUrl = "http://localhost:3008"

// 配置存储
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const mediaType = req.body.mediaType || 'misc';
        const dir = path.join(__dirname, 'uploads', mediaType);
        
        // 确保目录存在
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // 生成唯一文件名
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

// 文件类型过滤
const fileFilter = (req, file, cb) => {
    const mediaType = req.body.mediaType;
    console.log(`mediaType: ${mediaType}`,file)
    
    if (mediaType === 'image') {
        // 允许的图片类型
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片文件'), false);
        }
    } else if (mediaType === 'audio') {
        // 允许的音频类型
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传音频文件'), false);
        }
    } else {
        cb(null, true);
    }
};

const upload = multer({ 
    storage, 
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 限制文件大小为10MB
    }
});

// 文件上传路由
router.post('/upload', upload.single('media'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                code: 40000,
                status: 0,
                msg: '没有文件上传'
            });
        }
        console.log(req.file);

        // 返回文件URL
        const mediaUrl = `/uploads/${req.body.mediaType}/${req.file.filename}`;
        let data = {};
        if (req.body.mediaType === 'image') {
            // 这里可以使用sharp等库生成缩略图
            const thumbnailDir = path.join(__dirname, 'uploads', req.body.mediaType, 'thumbnails');
            if (!fs.existsSync(thumbnailDir)) {
                fs.mkdirSync(thumbnailDir, { recursive: true });
            }
             // 设置缩略图完整路径
             const thumbnailPath = path.join(thumbnailDir, req.file.filename);
            // 生成缩略图
            await sharp(req.file.path)
                .resize(200, 200, {
                    fit: 'cover',
                    position: 'center'
                })
                .toFile(thumbnailPath);
            // 简单实现，实际项目中应该使用图像处理库
            thumbnailUrl = `/uploads/${req.body.mediaType}/thumbnails/${req.file.filename}`;
            data ={
                mediaUrl:`${baseUrl}${mediaUrl}`,
                thumbnailUrl:`${baseUrl}${thumbnailUrl}`,
            }    
        }else if (req.body.mediaType === 'audio') {
            data = {
                mediaUrl:`${baseUrl}${mediaUrl}`,
                mediaDuration: req.body.duration,
            }
        }

        
        
        return res.status(200).json({
            code: 20100,
            status: 1,
            data: {
                ...data,
                originalName: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype
            },
            msg: '文件上传成功'
        });
    } catch (error) {
        console.error('文件上传错误:', error);
        return res.status(500).json({
            code: 50000,
            status: 0,
            msg: '文件上传失败: ' + error.message
        });
    }
});

// 地理位置解析API（可选，用于将坐标转换为地址）
router.post('/location/geocode', async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        
        if (!latitude || !longitude) {
            return res.status(400).json({
                code: 40000,
                status: 0,
                msg: '缺少必要的坐标参数'
            });
        }
        
        // 这里可以调用第三方地理编码API（如高德、百度等）
        // 示例：使用第三方API获取地址信息
        // const addressInfo = await getAddressFromCoordinates(latitude, longitude);
        
        // 模拟返回结果
        const addressInfo = {
            address: '模拟地址',
            name: '位置名称'
        };
        
        return res.status(200).json({
            code: 20100,
            status: 1,
            data: {
                latitude,
                longitude,
                ...addressInfo
            },
            msg: '地理编码成功'
        });
    } catch (error) {
        console.error('地理编码错误:', error);
        return res.status(500).json({
            code: 50000,
            status: 0,
            msg: '地理编码失败: ' + error.message
        });
    }
});

module.exports = router;