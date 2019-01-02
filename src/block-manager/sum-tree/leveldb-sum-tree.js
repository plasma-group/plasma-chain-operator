const log = require('debug')('info:leveldb-sum-tree')
const web3 = require('web3')
const BN = web3.utils.BN
const COIN_ID_BYTE_SIZE = require('../../constants.js').COIN_ID_BYTE_SIZE
const encoder = require('plasma-utils').encoder

const INDEX_BYTES_SIZE = 4

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

function coinIdToBuffer (coinId) {
  return coinId.toArrayLike(Buffer, 'big', COIN_ID_BYTE_SIZE)
}

class LevelDBSumTree {
  constructor (db) {
    this.db = db
  }

  getTransactionFromLeaf (value) {
    const index = value[0]
    const encoding = value.slice(1)
    const transaction = new encoder.Transaction(encoding)
    transaction.trIndex = index
    transaction.encoding = encoding
    return transaction
  }

  /**
   * Parses the leaves to generate the zero'th level of our sum tree
   * @param {*} Service Class of the service to register.
   * @param {*} options Any additional options.
   */
  async parseLeaves (blockNumber) {
    const self = this
    const minStart = Buffer.from('0'.repeat(COIN_ID_BYTE_SIZE * 2), 'hex')
    const maxEnd = Buffer.from('f'.repeat(COIN_ID_BYTE_SIZE * 2), 'hex')
    const firstLeaf = await this.getNearest(Buffer.concat([blockNumber, minStart]))
    const getTr = (tx) => tx.transferRecords.elements[tx.trIndex]
    const typedStart = (tr) => new BN(tr.type.toString(16, 8) + tr.start.toString(16, 24), 16)
    // Get first transaction
    const firstTransaction = this.getTransactionFromLeaf(firstLeaf.value)
    const firstTxStart = coinIdToBuffer(typedStart(getTr(firstTransaction))) // Store the first start as we will use it for our next seek
    // Set the first transaction prev leaf artificially to zero to make range subtraction work...
    let previousTransaction = firstTransaction
    previousTransaction.sumStart = new BN(0)
    // Read all remaining leaves, computing hash and setting sum value
    let previousTxIndex = new BN(0)
    this.db.createReadStream({
      'gt': Buffer.concat([blockNumber, firstTxStart]),
      'lt': Buffer.concat([blockNumber, maxEnd])
    }).on('data', function (data) {
      const transaction = self.getTransactionFromLeaf(data.value)
      transaction.sumStart = typedStart(getTr(transaction))
      const range = coinIdToBuffer(transaction.sumStart.sub(previousTransaction.sumStart))
      const prevTxHash = web3.utils.hexToBytes(web3.utils.soliditySha3(previousTransaction.encoding))
      self.writeNode(blockNumber, 0, previousTxIndex, prevTxHash, range)
      previousTxIndex = previousTxIndex.add(new BN(1))
      previousTransaction = transaction
    }).on('end', function (data) {
      const range = coinIdToBuffer(new BN(maxEnd).sub(previousTransaction.sumStart))
      const prevTxHash = web3.utils.hexToBytes(web3.utils.soliditySha3(previousTransaction.encoding))
      self.writeNode(blockNumber, 0, previousTxIndex, prevTxHash, range)
    })
  }

  async getNearest (key) {
    const it = this.db.iterator({
      gt: key,
      limit: 1
    })
    const result = await itNext(it)
    return result
  }

  async getHeight (blockNumber) {
    const height = await this.get(Buffer.concat([blockNumber, Buffer.from('height')]))
    return height
  }

  async getNode (level, index) {
    const node = await this.db.get(Buffer.concat([level, index]))
    return node
  }

  async writeNode (blockNumber, level, index, hash, sum) {
    log('Writing new node\nKey:', Buffer.concat([blockNumber, this.makeIndexId(level, index)]), '\nValue:', Buffer.concat([Buffer.from(hash), sum]))
    await this.db.put(Buffer.concat([blockNumber, this.makeIndexId(level, index)]), Buffer.concat([Buffer.from(hash), sum]))
  }

  makeIndexId (level, index) {
    return Buffer.concat([Buffer.from([level]), index.toArrayLike(Buffer, 'big', INDEX_BYTES_SIZE)])
  }

  getLeaf (index) {
    return this.leaves[index]
  }

  // generate (children, levels) {
  //   if (children.length <= 1) {
  //     return [children]
  //   }

  //   let parents = []
  //   for (let i = 0; i < children.length; i += 2) {
  //     let left = children[i]
  //     let right = (i + 1 === children.length) ? this.emptyNode() : children[i + 1]
  //     let parent = this.parent(left, right)
  //     parents.push(parent)
  //   }

  //   levels.push(parents)
  //   this.generate(parents, levels)
  //   return levels
  // }
}

module.exports = LevelDBSumTree
