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
   */
  async parseLeaves (blockNumber) {
    const self = this
    return new Promise(async (resolve, reject) => {
      // Helper functions for getting properties of our transactions
      const getTr = (tx) => tx.transferRecords.elements[tx.trIndex]
      const typedStart = (tr) => new BN(tr.type.toString(16, 8) + tr.start.toString(16, 24), 16)
      // Store the min and max values which can exist for any range. This will be used as the bounds of our stream
      const minStart = Buffer.from('0'.repeat(COIN_ID_BYTE_SIZE * 2), 'hex')
      const maxEnd = Buffer.from('f'.repeat(COIN_ID_BYTE_SIZE * 2), 'hex')
      // We need special logic to handle the first leaf / transaction. Because of this, look it up independently.
      const firstLeaf = await this.getNearest(Buffer.concat([blockNumber, minStart]))
      const firstTransaction = this.getTransactionFromLeaf(firstLeaf.value)
      // Now set the prev tx's sum start to *zero* instead of what it normally is--the previous transaction's start
      let previousTransaction = firstTransaction
      previousTransaction.sumStart = new BN(0)
      let previousTxIndex = new BN(0)
      // Read all remaining leaves, computing hash and setting sum value
      const firstTxStart = coinIdToBuffer(typedStart(getTr(firstTransaction))) // Store the first start as we will use it for our next seek
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
        resolve()
      }).on('error', function (err) {
        reject(err)
      })
    })
  }

  async getNearest (key) {
    const it = this.db.iterator({
      gt: key,
      limit: 1
    })
    const result = await itNext(it)
    await itEnd(it)
    return result
  }

  async getHeight (blockNumber) {
    const height = await this.get(Buffer.concat([blockNumber, Buffer.from('height')]))
    return height
  }

  async getNode (blockNumber, level, index) {
    const node = await this.db.get(this.makeNodeKey(blockNumber, level, index))
    return node
  }

  parseNodeValue (value) {
    return {
      hash: value.slice(0, 32),
      sum: new BN(value.slice(32))
    }
  }

  makeNodeKey (blockNumber, level, index) {
    return Buffer.concat([Buffer.from('node-'), blockNumber, this.makeIndexId(level, index)])
  }

  async writeNode (blockNumber, level, index, hash, sum) {
    const newNodeKey = this.makeNodeKey(blockNumber, level, index)
    log('Writing new node\nKey:', newNodeKey, '\nValue:', Buffer.concat([Buffer.from(hash), sum]))
    await this.db.put(newNodeKey, Buffer.concat([Buffer.from(hash), sum]))
  }

  makeIndexId (level, index) {
    return Buffer.concat([Buffer.from([level]), index.toArrayLike(Buffer, 'big', INDEX_BYTES_SIZE)])
  }

  emptyNode () {
    const emptyHash = Buffer.from('0'.repeat(64), 'hex')
    const emptySum = new BN(0)
    return {
      hash: emptyHash,
      sum: emptySum
    }
  }

  getParent (left, right) {
    const parentHash = web3.utils.hexToBytes(web3.utils.soliditySha3(Buffer.concat([left.hash, right.hash])))
    return {
      hash: parentHash,
      sum: left.sum.add(right.sum).toArrayLike(Buffer, 'big', COIN_ID_BYTE_SIZE)
    }
  }

  async generateLevel (blockNumber, level) {
    log('Starting to generate level:', level)
    const self = this
    const parentLevel = level + 1
    return new Promise((resolve, reject) => {
      // Create readstream for all nodes at the previous level
      const maxEnd = new BN('f'.repeat(INDEX_BYTES_SIZE * 2), 16)
      const readStream = this.db.createReadStream({
        'gte': this.makeNodeKey(blockNumber, level, new BN(0)),
        'lte': this.makeNodeKey(blockNumber, level, maxEnd)
      })
      // Go through every node at this level and build the next level's nodes
      let leftChild = null
      let numChildren = new BN(0)
      let parentIndex = new BN(0)
      let parentNode
      readStream.on('data', (data) => {
        log('Processing child:', data.key)
        numChildren = numChildren.add(new BN(1))
        // If this is the left child store it and move on
        if (leftChild === null) {
          leftChild = this.parseNodeValue(data.value)
          return
        }
        // Now we have the left and right children. Let's hash and compute the next sum
        const rightChild = this.parseNodeValue(data.value)
        parentNode = this.getParent(leftChild, rightChild)
        self.writeNode(blockNumber, parentLevel, parentIndex, parentNode.hash, parentNode.sum)
        parentIndex = parentIndex.add(new BN(1))
        leftChild = null
      }).on('end', async () => {
        // Check if there was only one node--that means we hit the root
        if (numChildren.eq(new BN(2))) {
          log('Returning root hash:', parentNode.hash.toString('hex'))
          resolve(parentNode.hash)
          return
        }
        // Check if we ended on an element that wasn't a right node. If so fill it in with a blank node
        if (leftChild !== null) {
          log('Filling in an odd length level with a zero node')
          const rightChild = this.emptyNode()
          const parentNode = this.getParent(leftChild, rightChild)
          self.writeNode(blockNumber, parentLevel, parentIndex, parentNode.hash, parentNode.sum)
        }
        resolve(await self.generateLevel(blockNumber, parentLevel))
      }).on('error', (err) => {
        reject(err)
      })
    })
  }
}

module.exports = LevelDBSumTree
