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
  const file = admin.storage().bucket().file(destinationPath);
  await file.save(buffer, {
    metadata: {
      contentType: contentType || 'application/octet-stream'
    }
  });
  await file.makePublic();

  const publicUrl = `https://storage.googleapis.com/${file.bucket.name}/${encodeURIComponent(file.name)}`;
  return { publicUrl };
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
