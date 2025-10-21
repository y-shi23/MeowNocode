import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cloud, TestTube, Save } from 'lucide-react';
import { toast } from 'sonner';
import s3StorageService from '@/lib/s3Storage';

export default function S3ConfigPanel({
  s3Config,
  updateS3Config,
  open = false,
  onOpenChange = () => {}
}) {
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [formData, setFormData] = useState({ ...s3Config });

  const resetForm = () => {
    setFormData({ ...s3Config });
  };

  useEffect(() => {
    if (open) {
      setFormData({ ...s3Config });
    }
  }, [open, s3Config]);

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const testConnection = async () => {
    if (!formData.endpoint || !formData.accessKeyId || !formData.secretAccessKey || !formData.bucket) {
      toast.error('请填写完整的S3配置信息');
      return;
    }

    setIsTestingConnection(true);
    try {
      s3StorageService.init(formData);
      const result = await s3StorageService.testConnection();

      if (result.success) {
        toast.success('S3连接测试成功！');
      } else {
        toast.error(`连接测试失败: ${result.error}`);
      }
    } catch (error) {
      console.error('S3连接测试失败:', error);
      toast.error('连接测试失败，请检查配置信息');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const saveConfig = () => {
    if (!formData.endpoint || !formData.accessKeyId || !formData.secretAccessKey || !formData.bucket) {
      toast.error('请填写完整的S3配置信息');
      return;
    }

    s3StorageService.init(formData);
    updateS3Config(formData);
    handleOpenChange(false);
    toast.success('S3配置已保存');
  };

  const getProviderTemplate = (provider) => {
    switch (provider) {
      case 'r2':
        return {
          endpoint: 'https://your-account.r2.cloudflarestorage.com',
          region: 'auto',
          placeholder: {
            endpoint: 'https://xxx.r2.cloudflarestorage.com',
            bucket: 'your-bucket-name'
          }
        };
      case 's3':
        return {
          endpoint: 'https://s3.amazonaws.com',
          region: 'us-east-1',
          placeholder: {
            endpoint: 'https://s3.amazonaws.com',
            bucket: 'your-bucket-name'
          }
        };
      case 'minio':
        return {
          endpoint: 'http://localhost:9000',
          region: 'us-east-1',
          placeholder: {
            endpoint: 'http://localhost:9000',
            bucket: 'your-bucket-name'
          }
        };
      default:
        return {
          endpoint: '',
          region: 'auto',
          placeholder: {
            endpoint: 'https://your-storage-endpoint.com',
            bucket: 'your-bucket-name'
          }
        };
    }
  };

  const handleProviderChange = (provider) => {
    const template = getProviderTemplate(provider);
    setFormData((prev) => ({
      ...prev,
      provider,
      endpoint: template.endpoint,
      region: template.region
    }));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden bg-white dark:bg-gray-800 shadow-xl p-0">
        <div className="flex h-full max-h-[90vh] flex-col">
          <DialogHeader className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-4 pr-12 dark:border-gray-700 dark:bg-gray-800">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Cloud className="h-5 w-5" />
              S3存储配置
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 custom-scrollbar scrollbar-hidden">
            <div className="space-y-2">
              <Label htmlFor="provider">存储提供商</Label>
              <Select value={formData.provider} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue placeholder="选择存储提供商" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="r2">Cloudflare R2</SelectItem>
                  <SelectItem value="s3">Amazon S3</SelectItem>
                  <SelectItem value="minio">MinIO</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">选择您的存储服务提供商</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endpoint">端点URL *</Label>
              <Input
                id="endpoint"
                value={formData.endpoint}
                onChange={(e) => setFormData((prev) => ({ ...prev, endpoint: e.target.value }))}
                placeholder={getProviderTemplate(formData.provider).placeholder.endpoint}
              />
              <p className="text-xs text-gray-500">S3服务的端点URL，例如: https://xxx.r2.cloudflarestorage.com</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessKeyId">访问密钥ID *</Label>
              <Input
                id="accessKeyId"
                value={formData.accessKeyId}
                onChange={(e) => setFormData((prev) => ({ ...prev, accessKeyId: e.target.value }))}
                placeholder="您的访问密钥ID"
                type="password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="secretAccessKey">秘密密钥 *</Label>
              <Input
                id="secretAccessKey"
                value={formData.secretAccessKey}
                onChange={(e) => setFormData((prev) => ({ ...prev, secretAccessKey: e.target.value }))}
                placeholder="您的秘密密钥"
                type="password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bucket">存储桶名称 *</Label>
              <Input
                id="bucket"
                value={formData.bucket}
                onChange={(e) => setFormData((prev) => ({ ...prev, bucket: e.target.value }))}
                placeholder={getProviderTemplate(formData.provider).placeholder.bucket}
              />
              <p className="text-xs text-gray-500">存储桶名称，例如: my-music-files</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="region">区域</Label>
              <Input
                id="region"
                value={formData.region}
                onChange={(e) => setFormData((prev) => ({ ...prev, region: e.target.value }))}
                placeholder="auto"
              />
              <p className="text-xs text-gray-500">存储区域，R2通常使用“auto”</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="publicUrl">公共URL（可选）</Label>
              <Input
                id="publicUrl"
                value={formData.publicUrl}
                onChange={(e) => setFormData((prev) => ({ ...prev, publicUrl: e.target.value }))}
                placeholder="https://your-cdn-domain.com"
              />
              <p className="text-xs text-gray-500">可选的CDN域名，留空则使用端点URL</p>
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="flex flex-1 gap-2 sm:flex-none">
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  className="flex-1 sm:flex-initial"
                >
                  取消
                </Button>
                <Button
                  onClick={testConnection}
                  disabled={isTestingConnection}
                  variant="outline"
                  className="flex-1 sm:flex-initial"
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  {isTestingConnection ? '测试中...' : '测试连接'}
                </Button>
              </div>
              <Button onClick={saveConfig} className="w-full sm:w-auto">
                <Save className="h-4 w-4 mr-2" />
                保存配置
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
