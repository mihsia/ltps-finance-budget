const { FIRESTORE_DATABASE_ID } = require('./firestoreConfig.cjs');

const getNamedFirestore = (getFirestore) => getFirestore(FIRESTORE_DATABASE_ID);

module.exports = { getNamedFirestore };
