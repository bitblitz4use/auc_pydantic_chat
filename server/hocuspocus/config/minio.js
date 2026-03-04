import * as Minio from 'minio';

export const BUCKET_NAME = 'auc-chat-storage';

export const minioClient = new Minio.Client({
  endPoint: 'localhost',
  port: 9102,
  useSSL: false,
  accessKey: 'admin',
  secretKey: 'admin123',
});

export const MINIO_CONFIG = {
  endPoint: 'localhost',
  port: 9102,
  useSSL: false,
  accessKey: 'admin',
  secretKey: 'admin123',
};
