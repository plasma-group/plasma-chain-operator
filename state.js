const fs = require('fs-extra')
const web3 = require('./eth.js')
const BN = web3.utils.BN
const tSerializer = require('./transaction-serialization.js')

const START_BYTE_SIZE = require('./constants.js').START_BYTE_SIZE
const TYPE_BYTE_SIZE = require('./constants.js').TYPE_BYTE_SIZE
const BLOCKNUMBER_BYTE_SIZE = require('./constants.js').BLOCKNUMBER_BYTE_SIZE
const DEPOSIT_SENDER = '0x0000000000000000000000000000000000000000'

// ************* HELPER FUNCTIONS ************* //
const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))
// Promisify the it.next(cb) function
function itNext (it) {
  return new Promise((resolve, reject) => {
    it.next((err, key, value) => {
      if (err) {
        reject(err)
      }
      resolve({key, value})
    })
  })
}

// Promisify the it.end(cb) function
function itEnd (it) {
  return new Promise((resolve, reject) => {
    it.end((err) => {
      if (err) {
        reject(err)
      }
      resolve()
    })
  })
}

function getDepositRecord (owner, type, start, offset, blocknumber) {
  const tr = new tSerializer.SimpleSerializableElement([DEPOSIT_SENDER, owner, type, start, offset, blocknumber], tSerializer.schemas.TransferRecord)
  return tr.encode()
}

function getAddressToTokenKey (address, type, end) {
  const buffers = [address,
    type.toArrayLike(Buffer, 'big', TYPE_BYTE_SIZE),
    end.toArrayLike(Buffer, 'big', START_BYTE_SIZE)
  ]
  return Buffer.concat(buffers)
}

function getTokenToTxKey (type, start) {
  const buffers = [
    type.toArrayLike(Buffer, 'big', TYPE_BYTE_SIZE),
    start.toArrayLike(Buffer, 'big', START_BYTE_SIZE)
  ]
  return Buffer.concat(buffers)
}

function getTotalDepositsKey (type) {
  return type.toArrayLike(Buffer, 'big', TYPE_BYTE_SIZE)
}

class State {
  constructor (db, txLogDirectory) {
    this.db = db
    this.txLogDirectory = txLogDirectory
    this.tmpTxLogFile = this.txLogDirectory + 'tmp-tx-log.bin'
    this.lock = {}
  }

  async init () {
    // Get the current block number
    try {
      const blocknumberBuff = await this.db.get('blocknumber')
      this.blocknumber = new BN(blocknumberBuff)
      console.log('Blocknumber found! Starting at: ' + this.blocknumber)
    } catch (err) {
      if (err.notFound) {
        console.log('No blocknumber found! Starting from block 0.')
        this.blocknumber = new BN(0)
        await this.db.put(Buffer.from('blocknumber'), this.blocknumber.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE))
      } else { throw err }
    }
    // Open a write stream for our tx log
    this.writeStream = fs.createWriteStream(this.tmpTxLogFile, { flags: 'a' })
  }

  async startNewBlock () {
    if (this.lock.all === true) {
      throw new Error('Attempting to start a new block when a global lock is already active')
    }
    // Start a global lock as we increment the block number. Note that we will have to wait until all other locks are released
    this.lock.all = true
    // Wait until all other locks are released
    while (Object.keys(this.lock).length !== 1) {
      console.log('Waiting to acquire global lock')
      await timeout(Math.random() * 10 + 2)
    }
    // Everything should be locked now that we have a `lock.all` activated. Time to increment the blocknumber
    this.blocknumber = this.blocknumber.add(new BN(1))
    await this.db.put(Buffer.from('blocknumber'), this.blocknumber.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE))
    // Start a new tx log
    this.writeStream.end()
    await fs.rename(this.tmpTxLogFile, this.txLogDirectory + +new Date())
    // Release our lock
    console.log('Releasing global lock')
    delete this.lock.all
  }

  attemptAcquireLocks (keywords) {
    keywords.push('all')
    if (keywords.some((val) => { return this.lock.hasOwnProperty(val) })) {
      // Failed to acquire locks
      return false
    }
    // Acquire locks
    for (let i = 0; i < keywords.length - 1; i++) {
      this.lock[keywords[i]] = true
    }
    return true
  }

  releaseLocks (keywords) {
    for (const keyword of keywords) {
      delete this.lock[keyword]
    }
  }

  async addDeposit (recipient, type, amount) {
    while (!this.attemptAcquireLocks([recipient, type])) {
      // Wait before attempting again
      await timeout(Math.random() * 10 + 2)
    }
    console.log('New deposit:', recipient, type, amount)
    // Get total deposits for this token type
    let oldTotalDeposits = new BN(0)
    try {
      const tdBuffer = await this.db.get(getTotalDepositsKey(type))
      oldTotalDeposits = new BN(tdBuffer)
    } catch (err) {
      if (err.notFound) {
        console.log('No total deposits found for type ', type, '! Starting from 0.')
      } else { throw err }
    }
    console.log('Old total deposits:', oldTotalDeposits)
    // Put the updated totalDeposits and owned token ranges
    const newTotalDeposits = oldTotalDeposits.add(amount)
    const depositRecord = getDepositRecord(web3.utils.bytesToHex(recipient), type, oldTotalDeposits, amount.sub(new BN(1)), this.blocknumber)
    try {
      // Put the new owned token range and the new total deposits
      const ops = [
        { type: 'put', key: getAddressToTokenKey(recipient, type, newTotalDeposits.sub(new BN(1))), value: Buffer.from([1]) },
        { type: 'put', key: getTokenToTxKey(type, newTotalDeposits.sub(new BN(1))), value: Buffer.from(depositRecord) },
        { type: 'put', key: getTotalDepositsKey(type), value: newTotalDeposits.toArrayLike(Buffer, 'big', TYPE_BYTE_SIZE) }
      ]
      await this.db.batch(ops)
    } catch (err) {
      throw err
    }
    this.releaseLocks([recipient, type])
    return newTotalDeposits
  }

  async addTransaction (trList) {
    // Acquire lock on all of the transfer record senders
    trList = trList.elements
    const senders = []
    for (const tr of trList) {
      senders.push(tr.sender)
    }
    while (!this.attemptAcquireLocks(senders)) {
      // Wait before attempting again
      await timeout(Math.random() * 10 + 2)
    }
    // Get all of the affectedRanges for each transfer record
    for (const [i, tr] of trList.entries()) {
      const af = await this.getAffectedRanges(tr.type, tr.start, tr.start.add(tr.offset))
      if (af.length === 0) { // If there are no affected ranges then this transfer must be invalid
        return false
      }
      for (let i = 0; i < af.length; i++) {
        af[i].decoded = tSerializer.decodeElement(af[i].value, tSerializer.schemas.TransferRecord)
      }
      trList[i].affectedRanges = af
    }
    // For all affected ranges, check:
    //    1) All affected ranges have not been touched this block
    //    2) All affected ranges are owned by the correct sender
    //    3) TODO: None of the transfer records overlap
    for (const tr of trList) {
      for (const ar of tr.affectedRanges) {
        if (tr.sender.toLowerCase() !== ar.decoded.recipient.toLowerCase() || ar.decoded.block.eq(this.blocknumber)) {
          this.releaseLocks(senders)
          return false
        }
      }
    }
    // Check the first range to see if we need to shorten it
    let dbBatch = []
    for (const tr of trList) {
      dbBatch = dbBatch.concat(this.getTransferBatchOps(tr, tr.affectedRanges))
    }
    await this.db.batch(dbBatch)
    // Check the last range to see if we need to shorten it
    // TODO: Actually update the state to include this transaction
    this.releaseLocks(senders)
    return true
  }

  getTransferBatchOps (tr, affectedRanges) {
    const dbBatch = []
    // Begin by queuing up the deletion of all affected ranges.
    for (const arEntry of affectedRanges) {
      const arRecipient = Buffer.from(web3.utils.hexToBytes(arEntry.decoded.recipient))
      dbBatch.push({ type: 'del', key: arEntry.key })
      dbBatch.push({ type: 'del', key: Buffer.concat([arRecipient, arEntry.key]) }) // Delete the address -> end mapping
    }
    // Now add back the ranges which were not entirely covered by this transfer.
    let ar = affectedRanges[0].decoded
    if (!ar.start.eq(tr.start)) {
      // Reduce the first affected range's end position. Eg: ##### becomes ###$$
      const arRecipient = Buffer.from(web3.utils.hexToBytes(ar.recipient))
      const arEnd = ar.start.add(ar.offset)
      // Store the old offset. This is because we want to created an updated entry without losing the original affected range
      const oldOffset = ar.offset
      // Get the encoding with the updated offset
      ar.offset = tr.start.sub(new BN(1)).sub(ar.start) // Update the offset of our entry
      const newEncoding = ar.encode()
      // Reset the old offset -- Note this is ugly code. TODO: Clean it up!
      ar.offset = oldOffset
      dbBatch.push({ type: 'put', key: getTokenToTxKey(tr.type, tr.start.sub(new BN(1))), value: Buffer.from(newEncoding) })
      dbBatch.push({ type: 'put', key: getAddressToTokenKey(arRecipient, ar.type, arEnd), value: Buffer.from([1]) })
    }
    ar = affectedRanges[affectedRanges.length - 1].decoded
    const trEnd = tr.start.add(tr.offset)
    const arEnd = ar.start.add(ar.offset)
    if (!arEnd.eq(trEnd)) {
      // Increase the last affected range's start position. Eg: ##### becomes $$###
      const arRecipient = Buffer.from(web3.utils.hexToBytes(ar.recipient))
      ar.start = trEnd.add(new BN(1))
      dbBatch.push({ type: 'put', key: affectedRanges[affectedRanges.length - 1].key, value: Buffer.from(ar.encode()) })
      dbBatch.push({ type: 'put', key: getAddressToTokenKey(arRecipient, ar.type, arEnd), value: Buffer.from([1]) })
    }
    // Add our new transfer record
    const trRecipient = Buffer.from(web3.utils.hexToBytes(tr.recipient))
    dbBatch.push({ type: 'put', key: getTokenToTxKey(tr.type, trEnd), value: Buffer.from(tr.encode()) })
    dbBatch.push({ type: 'put', key: getAddressToTokenKey(trRecipient, tr.type, trEnd), value: Buffer.from([1]) })
    // And finally apply the batch operations
    return dbBatch
  }

  async getAffectedRanges (type, start, end) {
    const it = this.db.iterator({
      gt: getTokenToTxKey(new BN(type), new BN(start))
    })
    const affectedRanges = []
    let result = await itNext(it)
    const typeBuffer = type.toArrayLike(Buffer, 'big', TYPE_BYTE_SIZE)
    if (Buffer.compare(typeBuffer, result.key.slice(0, 4)) !== 0) {
      return []
    }
    affectedRanges.push(result)
    while (Buffer.compare(result.key.slice(4), end.toArrayLike(Buffer, 'big', START_BYTE_SIZE)) < 0) {
      result = await itNext(it)
      affectedRanges.push(result)
    }
    await itEnd(it)
    return affectedRanges
  }
}

module.exports = {
  State,
  getAddressToTokenKey,
  getTokenToTxKey,
  getTotalDepositsKey
}
