// S3存储服务 - 使用AWS SDK版本，支持Cloudflare R2
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

class S3StorageService {
  constructor() {
    this.config = null;
    this.client = null;
    this.initialized = false;
  }

  // 初始化S3配置
  init(config) {
    this.config = {
      endpoint: config.endpoint,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      bucket: config.bucket,
      region: config.region || 'auto',
      publicUrl: config.publicUrl || config.endpoint,
      provider: config.provider || 'r2'
    };
    
    // 创建S3客户端
    this.client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey
      },
      // 对于Cloudflare R2，需要强制使用路径寻址
      forcePathStyle: this.config.provider === 'r2',
      // 关闭请求端校验计算，避免浏览器端触发 streaming trailer 导致 getReader 报错
      requestChecksumCalculation: 'never'
    });
    
    this.initialized = true;
  }

  // 检查是否已配置
  isConfigured() {
    const required = ['endpoint', 'accessKeyId', 'secretAccessKey', 'bucket'];
    return this.initialized && this.config && 
           required.every(key => this.config[key]);
  }

  // 验证S3配置
  validateConfig() {
    const errors = [];
    
    if (!this.config.endpoint) {
      errors.push('缺少端点URL');
    } else if (!this.config.endpoint.startsWith('http')) {
      errors.push('端点URL格式不正确');
    }
    
    if (!this.config.bucket) {
      errors.push('缺少存储桶名称');
    }
    
    if (!this.config.accessKeyId) {
      errors.push('缺少访问密钥ID');
    }
    
    if (!this.config.secretAccessKey) {
      errors.push('缺少秘密访问密钥');
    }
    
    if (errors.length > 0) {
      throw new Error(`S3配置验证失败: ${errors.join(', ')}`);
    }
    
    return true;
  }

  // 生成唯一文件名
  generateFileName(originalName, type = 'file') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = originalName.split('.').pop();
    const cleanName = originalName.split('.')[0].replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    // 对于测试文件，直接放在根目录，不添加类型前缀
    if (type === 'test') {
      return `connection_test_${timestamp}_${random}_${cleanName}.${extension}`;
    }
    return `${type}/${timestamp}_${random}_${cleanName}.${extension}`;
  }

  // 构建S3 URL的统一方法
  buildS3Url(baseEndpoint, fileName) {
    // 移除末尾的斜杠
    const cleanEndpoint = baseEndpoint.replace(/\/$/, '');
    
    // 对于Cloudflare R2，需要正确构建URL
    if (this.config.provider === 'r2') {
      // 检查端点URL是否已经包含了桶名
      if (cleanEndpoint.includes(`/${this.config.bucket}`)) {
        return `${cleanEndpoint}/${fileName}`;
      } else {
        return `${cleanEndpoint}/${this.config.bucket}/${fileName}`;
      }
    }
    // 对于其他提供商，需要包含桶名
    return `${cleanEndpoint}/${this.config.bucket}/${fileName}`;
  }

  // 获取正确的S3端点URL
  getS3Url(fileName) {
    return this.buildS3Url(this.config.endpoint, fileName);
  }

  // 获取公共URL
  getPublicUrl(fileName) {
    if (this.config.publicUrl) {
      return this.buildS3Url(this.config.publicUrl, fileName);
    }
    return this.getS3Url(fileName);
  }

  // 上传文件到S3
  async uploadFile(file, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('S3存储未配置');
    }
    
    // 验证配置
    this.validateConfig();

    const fileName = options.fileName || this.generateFileName(file.name || 'blob', options.type || 'file');
    const contentType = file.type || 'application/octet-stream';
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    // 对于R2，优先使用单次PUT以避免浏览器端多段上传需要读取每段ETag（若CORS未暴露ETag会失败）
    const SINGLE_PUT_MAX_BYTES = options.singlePutMaxBytes
      || this.config.singlePutMaxBytes
      || 512 * 1024 * 1024; // 512MB 默认阈值

    try {
      console.log('准备上传文件到S3:', {
        fileName,
        bucket: this.config.bucket,
        endpoint: this.config.endpoint,
        provider: this.config.provider,
        fileSize: file.size,
        contentType
      });

      // 使用AWS SDK直接上传
      console.log('使用AWS SDK上传...');

      // R2 且文件小于阈值 -> 强制单次 PutObject，规避多段上传对 ETag 的 CORS 依赖
      const useSinglePut = this.config.provider === 'r2' && typeof file.size === 'number' && file.size <= SINGLE_PUT_MAX_BYTES;

      if (useSinglePut) {
        if (onProgress) onProgress('uploading', 5);
        const putCmd = new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: fileName,
          Body: file,
          ContentType: contentType
        });
        const result = await this.client.send(putCmd);
        console.log('PutObject 上传成功:', result);

        if (onProgress) onProgress('complete', 100);

        return {
          success: true,
          fileName: fileName,
          originalName: file.name,
          size: file.size,
          type: file.type,
          url: this.getPublicUrl(fileName),
          storageType: 's3',
          uploadedAt: new Date().toISOString(),
          uploadMethod: 'put-object'
        };
      }

      // 超过阈值时使用分片上传
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.config.bucket,
          Key: fileName,
          Body: file,
          ContentType: contentType
        }
      });

      upload.on('httpUploadProgress', (progress) => {
        const percent = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;
        console.log('上传进度:', percent + '%');
        if (onProgress) onProgress('uploading', percent);
      });

      const result = await upload.done();
      console.log('Multipart 上传成功:', result);

      return {
        success: true,
        fileName: fileName,
        originalName: file.name,
        size: file.size,
        type: file.type,
        url: this.getPublicUrl(fileName),
        storageType: 's3',
        uploadedAt: new Date().toISOString(),
        uploadMethod: 'multipart'
      };

    } catch (error) {
      console.error('S3上传失败:', error);
      
      // 提供更详细的错误信息
      let errorMessage = error.message;
      if (error.name === 'CredentialsProviderError') {
        errorMessage = '认证失败：请检查API密钥配置';
      } else if (error.name === 'NoSuchBucket') {
        errorMessage = '存储桶不存在：请检查存储桶名称';
      } else if (error.name === 'AccessDenied') {
        errorMessage = '访问被拒绝：请检查存储桶权限和API密钥';
      } else if (error.name === 'NetworkError') {
        errorMessage = '网络错误：请检查端点URL和网络连接';
      } else if (error.message?.toLowerCase().includes('etag') || error.message?.toLowerCase().includes('cors')) {
        // 针对 R2 多段上传常见问题：浏览器无法读取每段响应中的 ETag（未在 CORS 中暴露）
        errorMessage = 'CORS错误：R2需在桶的CORS中将 ETag 加入 Access-Control-Expose-Headers，或改用单次上传/提高singlePut阈值';
      }
      
      throw new Error(`S3上传失败: ${errorMessage}`);
    }
  }

  async uploadJson(key, data, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('S3存储未配置');
    }

    // 验证配置
    this.validateConfig();

    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const fileName = key || options.fileName || 'data.json';
    let file;
    if (typeof File !== 'undefined') {
      file = new File([payload], fileName.split('/').pop() || 'data.json', {
        type: 'application/json'
      });
    } else {
      const blob = new Blob([payload], { type: 'application/json' });
      file = Object.assign(blob, {
        name: fileName.split('/').pop() || 'data.json',
        lastModified: Date.now()
      });
    }

    return this.uploadFile(file, {
      type: 'json',
      fileName,
      singlePutMaxBytes: options.singlePutMaxBytes
    });
  }

  async downloadJson(key) {
    if (!this.isConfigured()) {
      throw new Error('S3存储未配置');
    }

    const url = this.getPublicUrl(key);

    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`下载失败: ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      if (!text) return null;
      return JSON.parse(text);
    } catch (error) {
      console.error('S3下载JSON失败:', error);
      throw new Error(error.message || 'S3下载JSON失败');
    }
  }

  // 删除文件
  async deleteFile(fileName) {
    if (!this.isConfigured()) {
      throw new Error('S3存储未配置');
    }
    
    // 验证配置
    this.validateConfig();

    try {
      console.log('准备删除文件:', {
        fileName,
        bucket: this.config.bucket,
        provider: this.config.provider
      });

      // 使用AWS SDK直接删除
      console.log('使用AWS SDK删除...');

      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: fileName
      });

      const result = await this.client.send(command);
      console.log('AWS SDK删除成功:', result);

      return { 
        success: true, 
        fileName: fileName,
        deletedAt: new Date().toISOString(),
        deleteMethod: 'aws-sdk'
      };

    } catch (error) {
      console.error('S3删除失败:', error);
      
      // 提供更详细的错误信息
      let errorMessage = error.message;
      if (error.name === 'CredentialsProviderError') {
        errorMessage = '认证失败：请检查API密钥配置';
      } else if (error.name === 'NoSuchBucket') {
        errorMessage = '存储桶不存在：请检查存储桶名称';
      } else if (error.name === 'AccessDenied') {
        errorMessage = '访问被拒绝：请检查存储桶权限和API密钥';
      } else if (error.name === 'NetworkError') {
        errorMessage = '网络错误：请检查端点URL和网络连接';
      }
      
      throw new Error(`S3删除失败: ${errorMessage}`);
    }
  }

  // 检查文件是否存在
  async fileExists(fileName) {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: fileName
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
        return false;
      }
      console.error('检查文件存在性失败:', error);
      return false;
    }
  }

  // 获取存储统计信息
  async getStorageStats() {
    if (!this.isConfigured()) {
      return null;
    }

    return {
      provider: 'S3/Cloudflare R2',
      endpoint: this.config.endpoint,
      bucket: this.config.bucket,
      configured: true,
      sdk: 'AWS SDK v3'
    };
  }

  // 测试连接
  async testConnection() {
    if (!this.isConfigured()) {
      return { success: false, error: 'S3存储未配置' };
    }

    try {
      console.log('开始测试S3连接...');
      console.log('配置信息:', {
        endpoint: this.config.endpoint,
        bucket: this.config.bucket,
        provider: this.config.provider,
        region: this.config.region
      });

      // 首先验证配置
      this.validateConfig();

      // 创建一个测试文件来验证连接
      const testFileName = `connection_test_${Date.now()}.txt`;
      const testContent = new Blob(['Connection test ' + new Date().toISOString()], { type: 'text/plain' });
      
      console.log('上传测试文件:', testFileName);
      
      const uploadResult = await this.uploadFile(testContent, { 
        fileName: testFileName,
        type: 'test'
      });
      
      console.log('上传成功:', uploadResult);
      
      // 验证文件是否可以访问
      const exists = await this.fileExists(testFileName);
      console.log('文件存在性检查:', exists);
      
      // 清理测试文件
      console.log('删除测试文件...');
      await this.deleteFile(testFileName);
      console.log('测试文件删除成功');
      
      return { 
        success: true, 
        message: 'S3连接测试成功',
        details: {
          provider: this.config.provider,
          endpoint: this.config.endpoint,
          bucket: this.config.bucket,
          uploadMethod: uploadResult.uploadMethod,
          sdk: 'AWS SDK v3'
        }
      };
    } catch (error) {
      console.error('S3连接测试失败:', error);
      
      // 提供更具体的错误信息
      let errorMessage = error.message;
      if (error.message.includes('配置验证失败')) {
        errorMessage = 'S3配置不完整或格式错误，请检查所有必填字段';
      } else if (error.name === 'CredentialsProviderError') {
        errorMessage = '认证失败：请检查API密钥配置';
      } else if (error.name === 'NoSuchBucket') {
        errorMessage = '存储桶不存在：请检查存储桶名称和端点配置';
      } else if (error.name === 'AccessDenied') {
        errorMessage = '访问被拒绝：请检查存储桶权限和API密钥';
      } else if (error.name === 'NetworkError') {
        errorMessage = '网络错误：请检查端点URL和网络连接';
      } else if (error.message.includes('CORS')) {
        errorMessage = 'CORS配置错误，请确保Cloudflare R2存储桶允许跨域请求';
      }
      
      return { 
        success: false, 
        error: errorMessage,
        details: {
          originalError: error.message,
          errorName: error.name,
          config: {
            provider: this.config.provider,
            endpoint: this.config.endpoint,
            bucket: this.config.bucket
          }
        }
      };
    }
  }
}

// 创建全局实例
const s3StorageService = new S3StorageService();

export default s3StorageService;
