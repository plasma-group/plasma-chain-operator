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

function getDepositRecord (owner, type, start, offset, blocknumber) {
  const tr = new tSerializer.SimpleSerializableElement([DEPOSIT_SENDER, owner, type, start, offset, blocknumber], tSerializer.schemas.TransferRecord)
  return tr.encode()
}

function getAddressToTokenKey (address, type, start) {
  const buffers = [address,
    type.toArrayLike(Buffer, 'big', TYPE_BYTE_SIZE),
    start.toArrayLike(Buffer, 'big', START_BYTE_SIZE)
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
      console.log('Waiting to release global lock')
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
      console.log('Locked! Waiting to release')
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
        { type: 'put', key: getAddressToTokenKey(recipient, type, oldTotalDeposits), value: Buffer.from([1]) },
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
    // Check that all ranges have not been touched this block
    // Check that there are no locks on these ranges or accounts
  }

  async getAffectedRanges (start, end) {
    const it = this.db.iterator({
      gt: getTokenToTxKey(new BN(0), new BN(5))
    })
    const affectedRanges = []
    let result = await itNext(it)
    affectedRanges.push(result)
    while (new BN(result.key).lt(end)) {
      result = await itNext(it)
      affectedRanges.push(result)
    }
    return affectedRanges
  }
}

module.exports = {
  State,
  getAddressToTokenKey,
  getTokenToTxKey,
  getTotalDepositsKey
}
