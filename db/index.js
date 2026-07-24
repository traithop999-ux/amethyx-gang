let backend;

try {
  backend = require('./firebase');
  console.log('DB Backend: Firebase');
} catch (err) {
  console.error('Firebase init failed:', err);
  throw err;
}

backend.uploadFile = backend.uploadFile || (async () => { throw new Error('uploadFile is not implemented'); });
backend.deleteFile = backend.deleteFile || (async () => { throw new Error('deleteFile is not implemented'); });

module.exports = backend;
