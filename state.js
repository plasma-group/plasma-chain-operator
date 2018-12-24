const BN = require('./eth.js').utils.BN

const START_BYTE_SIZE = require('./constants.js').START_BYTE_SIZE
const TYPE_BYTE_SIZE = require('./constants.js').TYPE_BYTE_SIZE
const BLOCKNUMBER_BYTE_SIZE = require('./constants.js').BLOCKNUMBER_BYTE_SIZE

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
  constructor (db, callback) {
    this.db = db
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
        await this.db.put('blocknumber', this.blocknumber.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE))
      } else { throw err }
    }
  }

  async addDeposit (recipient, type, amount) {
    // Check if there is a lock on this token type or recipient
    if (this.lock.hasOwnProperty(recipient) || this.lock.hasOwnProperty(type)) {
      setTimeout(this.addDeposit(recipient, type, amount), Math.random() * 10 + 1)
      return
    }
    // Create a lock on the account and token type
    this.lock[recipient] = true
    this.lock[type] = true
    console.log('new deposit!', recipient, type, amount)
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
    try {
      // Put the new owned token range and the new total deposits
      const newTotalDeposits = totalDeposits.add(amount)
      const ops = [
        { type: 'put', key: getAddressToTokenKey(recipient, type, totalDeposits), value: Buffer.from([1]) },
        { type: 'put', key: getTokenToTxKey(type, totalDeposits), value: this.blocknumber.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE) },
        { type: 'put', key: getTotalDepositsKey(type), value: newTotalDeposits.toArrayLike(Buffer, 'big', TYPE_BYTE_SIZE) }
      ]
      await this.db.batch(ops)
    } catch (err) {
      throw err
    }
    delete this.lock[recipient]
    delete this.lock[type]
  }
}

module.exports = State
