const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
const DEFAULT_FIREBASE_STORAGE_BUCKET = 'amethyx-gang.firebasestorage.app';

let initialized = false;

function loadFirebaseCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const envValue = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (fs.existsSync(envValue)) {
      return admin.credential.cert(require(envValue));
    }

    try {
      return admin.credential.cert(JSON.parse(envValue));
    } catch (err) {
      try {
        const decoded = Buffer.from(envValue, 'base64').toString('utf8');
        return admin.credential.cert(JSON.parse(decoded));
      } catch (innerErr) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT as JSON or base64:', innerErr);
        throw innerErr;
      }
    }
  }

  if (fs.existsSync(serviceAccountPath)) {
    return admin.credential.cert(require(serviceAccountPath));
  }

  return admin.credential.applicationDefault();
}

function initFirebase() {
  if (initialized) return;

  const credential = loadFirebaseCredential();
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_STORAGE_BUCKET;

  const appConfig = { credential };
  if (storageBucket) {
    appConfig.storageBucket = storageBucket;
  }

  admin.initializeApp(appConfig);

  initialized = true;
}

function getStorageBucketCandidates() {
  const envBucket = process.env.FIREBASE_STORAGE_BUCKET;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const candidates = new Set();

  if (envBucket) {
    candidates.add(envBucket);
  }

  candidates.add(DEFAULT_FIREBASE_STORAGE_BUCKET);

  if (projectId) {
    candidates.add(`${projectId}.appspot.com`);
    if (`${projectId}.appspot.com` !== DEFAULT_FIREBASE_STORAGE_BUCKET) {
      candidates.add(`${projectId}.firebasestorage.app`);
    }
  }

  return Array.from(candidates);
}

initFirebase();

const firestore = admin.firestore();
const usersCollection = firestore.collection('users');
const treasuryDoc = firestore.doc('gang/treasury');

function normalizeValue(value) {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString('base64');
  }
  if (Array.isArray(value)) {
    return value
      .map(normalizeValue)
      .filter(normalized => normalized !== undefined);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, nestedValue]) => [key, normalizeValue(nestedValue)])
        .filter(([, normalized]) => normalized !== undefined)
    );
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  return value;
}

function normalizeDocumentData(docData) {
  return normalizeValue(docData);
}

function prepareDataForFirestore(data) {
  return normalizeValue(data);
}

async function readDatabase() {
  const usersSnapshot = await usersCollection.get();
  const treasurySnapshot = await treasuryDoc.get();

  const users = [];
  usersSnapshot.forEach(doc => {
    users.push({ id: doc.id, ...normalizeDocumentData(doc.data()) });
  });

  const treasuryData = treasurySnapshot.exists
    ? normalizeDocumentData(treasurySnapshot.data())
    : { id: 'main', balance: 0, logs: [] };

  return {
    users,
    treasury: treasuryData
  };
}

async function writeDatabase(data) {
  const batch = firestore.batch();

  if (Array.isArray(data.users)) {
    data.users.forEach(user => {
      const userRef = usersCollection.doc(String(user.id));
      batch.set(userRef, prepareDataForFirestore(user), { merge: true });
    });
  }

  batch.set(treasuryDoc, prepareDataForFirestore(data.treasury || { id: 'main', balance: 0, logs: [] }), { merge: true });

  await batch.commit();
}

function createDataUri(buffer, contentType) {
  const base64 = buffer.toString('base64');
  return `data:${contentType || 'application/octet-stream'};base64,${base64}`;
}

async function uploadFile(buffer, destinationPath, contentType) {
  const bucketCandidates = getStorageBucketCandidates();

  for (const bucketName of bucketCandidates) {
    try {
      const bucket = admin.storage().bucket(bucketName);
      const [exists] = await bucket.exists();
      if (!exists) {
        console.warn(`Storage bucket does not exist: ${bucketName}`);
        continue;
      }

      const file = bucket.file(destinationPath);
      await file.save(buffer, {
        metadata: {
          contentType: contentType || 'application/octet-stream'
        }
      });

      await file.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(file.name)}`;
      return { publicUrl };
    } catch (err) {
      console.warn(`Failed to upload with bucket ${bucketName}:`, err?.message || err);
      continue;
    }
  }

  console.warn('All storage bucket candidates failed, using inline data URI fallback');
  const publicUrl = createDataUri(buffer, contentType || 'application/octet-stream');
  return { publicUrl };
}

async function deleteFile(destinationPath) {
  if (!destinationPath || destinationPath.startsWith('data:')) {
    return;
  }

  const file = admin.storage().bucket().file(destinationPath);
  await file.delete({ ignoreNotFound: true });
}

module.exports = {
  admin,
  firestore,
  bucket: admin.storage().bucket(),
  readDatabase,
  writeDatabase,
  uploadFile,
  deleteFile
};
