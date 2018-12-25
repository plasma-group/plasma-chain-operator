const fs = require('fs-extra')
const BN = require('./eth.js').utils.BN

const START_BYTE_SIZE = require('./constants.js').START_BYTE_SIZE
const TYPE_BYTE_SIZE = require('./constants.js').TYPE_BYTE_SIZE
const BLOCKNUMBER_BYTE_SIZE = require('./constants.js').BLOCKNUMBER_BYTE_SIZE

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))

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

  async acquireLocks (keywords) {
    let counter = 0
    keywords.push('all')
    while (keywords.some((val) => { return this.lock.hasOwnProperty(val) })) {
      console.log('Locked! Waiting to release')
      await timeout(Math.random() * 10 + 2)
      counter++
      if (counter > 100) {
        throw new Error('Lock timed out! Look into why this is')
      }
    }
    // Acquire locks
    for (let i = 0; i < keywords.length - 1; i++) {
      this.lock[keywords[i]] = true
    }
  }

  releaseLocks (keywords) {
    for (const keyword of keywords) {
      delete this.lock[keyword]
    }
  }

  async addDeposit (recipient, type, amount) {
    await this.acquireLocks([recipient, type])
    console.log('New deposit:', recipient, type, amount)
    // Get total deposits for this token type
    let totalDeposits = new BN(0)
    try {
      const tdBuffer = await this.db.get(getTotalDepositsKey(type))
      totalDeposits = new BN(tdBuffer)
    } catch (err) {
      if (err.notFound) {
        console.log('No total deposits found for type ', type, '! Starting from 0.')
      } else { throw err }
    }
    console.log('Total deposits:', totalDeposits)
    // Put the updated totalDeposits and owned token ranges
    const newTotalDeposits = totalDeposits.add(amount)
    try {
      // Put the new owned token range and the new total deposits
      const ops = [
        { type: 'put', key: getAddressToTokenKey(recipient, type, totalDeposits), value: Buffer.from([1]) },
        { type: 'put', key: getTokenToTxKey(type, totalDeposits), value: this.blocknumber.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE) },
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
    //
  }
}

module.exports = {
  State,
  getAddressToTokenKey,
  getTokenToTxKey,
  getTotalDepositsKey
}
