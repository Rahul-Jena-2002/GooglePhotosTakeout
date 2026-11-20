import { doc, increment, runTransaction, type Firestore } from 'firebase/firestore'

export async function applyUsageBatch(db: Firestore, uid: string, batchId: string, bytes: number, files: number) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchId)
      || !Number.isSafeInteger(bytes) || bytes < 0 || !Number.isSafeInteger(files) || files < 0) {
    throw new Error('Invalid usage batch')
  }
  const userRef = doc(db, 'users', uid)
  const batchRef = doc(db, 'users', uid, 'usageBatches', batchId)
  await runTransaction(db, async transaction => {
    const existing = await transaction.get(batchRef)
    if (existing.exists()) {
      if (existing.data().bytes !== bytes || existing.data().files !== files) throw new Error('Usage batch does not match its saved record')
      return
    }
    transaction.set(batchRef, { bytes, files })
    transaction.set(userRef, {
      usedBytes: increment(bytes), usedFiles: increment(files),
      totalBytesProcessed: increment(bytes), totalFilesProcessed: increment(files)
    }, { merge: true })
  })
}
