import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const configureMulter = (options = {}) => {
  const defaultOptions = {
    fieldName: 'file',
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    fileSize: 5 * 1024 * 1024, // 5MB
    destination: 'uploads/general',
    ...options
  };

  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        if (!fs.existsSync(defaultOptions.destination)) {
          fs.mkdirSync(defaultOptions.destination, { recursive: true });
        }
        cb(null, defaultOptions.destination);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, `${file.fieldname}-${uniqueSuffix}`);
      }
    }),
    fileFilter: (req, file, cb) => {
      if (defaultOptions.allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type. Only ${defaultOptions.allowedTypes.join(', ')} are allowed.`), false);
      }
    },
    limits: {
      fileSize: defaultOptions.fileSize
    }
  });
};

// Pre-configured uploaders for different use cases
export const workspaceLogoUpload = configureMulter({
  fieldName: 'logo',
  destination: 'uploads/workspaces/logos',
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
});

export const handleFileUpload = (uploader) => {
  return (req, res) => {
    return new Promise((resolve, reject) => {
      uploader(req, res, (err) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              return reject(new Error(`File size too large. Maximum ${uploader.limits.fileSize / (1024 * 1024)}MB allowed.`));
            }
            return reject(new Error('File upload error.'));
          }
          return reject(err);
        }
        resolve();
      });
    });
  };
};