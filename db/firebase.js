const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');

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
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.appspot.com` : undefined);

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
    if (envBucket.endsWith('.firebasestorage.app') && projectId) {
      candidates.add(`${projectId}.appspot.com`);
    }
    if (envBucket.endsWith('.appspot.com') && projectId) {
      candidates.add(`${projectId}.firebasestorage.app`);
    }
  }

  if (projectId) {
    candidates.add(`${projectId}.appspot.com`);
    candidates.add(`${projectId}.firebasestorage.app`);
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
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeValue(nestedValue)])
    );
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

async function uploadFile(buffer, destinationPath, contentType) {
  const bucketCandidates = getStorageBucketCandidates();
  let lastError = null;

  for (const bucketName of bucketCandidates) {
    try {
      const bucket = admin.storage().bucket(bucketName);
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
      lastError = err;
      if (err?.response?.status === 404) {
        console.warn(`Storage bucket not found: ${bucketName}`);
        continue;
      }
      throw err;
    }
  }

  console.error('All storage bucket candidates failed:', bucketCandidates, lastError);
  throw lastError || new Error('Failed to upload file to any Firebase storage bucket');
}

async function deleteFile(destinationPath) {
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
