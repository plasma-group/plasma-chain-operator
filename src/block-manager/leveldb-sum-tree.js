const log = require('debug')('info:leveldb-sum-tree')
const web3 = require('web3')
const BN = web3.utils.BN
const COIN_ID_BYTE_SIZE = require('../constants.js').COIN_ID_BYTE_SIZE
const BLOCK_TX_PREFIX = require('../constants.js').BLOCK_TX_PREFIX
const BLOCK_INDEX_PREFIX = require('../constants.js').BLOCK_INDEX_PREFIX
const NUM_LEVELS_PREFIX = require('../constants.js').BLOCK_TX_PREFIX
const NODE_DB_PREFIX = require('../constants.js').NODE_DB_PREFIX
const models = require('plasma-utils').serialization.models
const SignedTransaction = models.SignedTransaction
const UnsignedTransaction = models.UnsignedTransaction
const Transfer = models.Transfer
const itNext = require('../utils.js').itNext
const itEnd = require('../utils.js').itEnd
const sha3 = require('../utils.js').sha3
const Decimal = require('decimal.js-light')

const INDEX_BYTES_SIZE = 4

function coinIdToBuffer (coinId) {
  return coinId.toArrayLike(Buffer, 'big', COIN_ID_BYTE_SIZE)
}

class LevelDBSumTree {
  constructor (db) {
    this.db = db
  }

  async generateTree (blockNumber) {
    const numLeaves = await this.parseLeaves(blockNumber)
    let heightOfTree
    if (numLeaves === undefined) {
      heightOfTree = 0
    } else {
      // TODO: Replace this and instead detect heightOfTree in generateLevel
      heightOfTree = Math.ceil(new Decimal(numLeaves.toString(10)).log(2).toNumber())
    }
    const rootHash = await this.generateLevel(blockNumber, 0, heightOfTree)
    log('Generating tree for block:', blockNumber.toString('hex'), 'with root:', Buffer.from(rootHash).toString('hex'))
    return rootHash
  }

  getTransactionFromLeaf (value) {
    const index = value[0]
    const encoding = value.slice(1)
    const transaction = new SignedTransaction(encoding.toString('hex'))
    transaction.trIndex = index
    transaction.encoding = encoding
    return transaction
  }

  getUnsignedTransaction (tx) {
    const unsignedTx = new UnsignedTransaction({block: tx.block, transfers: tx.transfers})
    return unsignedTx
  }

  /**
   * Parses the leaves to generate the zero'th level of our sum tree
   */
  async parseLeaves (blockNumber) {
    const self = this
    return new Promise(async (resolve, reject) => {
      // Helper functions for getting properties of our transactions
      const getTr = (tx) => new Transfer(tx.transfers[tx.trIndex])
      const typedStart = (tr) => new BN(tr.token.toString(16, 8) + tr.start.toString(16, 24), 16)
      // Store the min and max values which can exist for any range. This will be used as the bounds of our stream
      const minStart = Buffer.from('0'.repeat(COIN_ID_BYTE_SIZE * 2), 'hex')
      const maxEnd = Buffer.from('f'.repeat(COIN_ID_BYTE_SIZE * 2), 'hex')
      // Store the prefix which all our transactions should have
      const blockTxPrefix = Buffer.concat([BLOCK_TX_PREFIX, blockNumber])
      // We need special logic to handle the first leaf / transaction. Because of this, look it up independently.
      const firstLeaf = await this.getNearest(Buffer.concat([blockTxPrefix, minStart]))
      // Check if this block is empty -- if the nearest
      if (firstLeaf.key === undefined || !firstLeaf.key.slice(0, blockTxPrefix.length).equals(blockTxPrefix)) {
        // This block appears to be empty! Return early
        resolve()
        return
      }
      const firstTransaction = this.getTransactionFromLeaf(firstLeaf.value)
      // Now set the prev tx's sum start to *zero* instead of what it normally is--the previous transaction's start
      let previousTransaction = firstTransaction
      previousTransaction.sumStart = new BN(0)
      let previousTxIndex = new BN(0)
      // Read all remaining leaves, computing hash and setting sum value
      const firstTxStart = coinIdToBuffer(typedStart(getTr(firstTransaction))) // Store the first start as we will use it for our next seek
      this.db.createReadStream({
        'gt': Buffer.concat([BLOCK_TX_PREFIX, blockNumber, firstTxStart]),
        'lt': Buffer.concat([BLOCK_TX_PREFIX, blockNumber, maxEnd])
      }).on('data', function (data) {
        const transaction = self.getTransactionFromLeaf(data.value)
        transaction.sumStart = typedStart(getTr(transaction))
        const range = coinIdToBuffer(transaction.sumStart.sub(previousTransaction.sumStart))
        const prevTxHash = sha3(Buffer.from(self.getUnsignedTransaction(previousTransaction).encoded, 'hex'))
        self.writeNode(blockNumber, 0, previousTxIndex, prevTxHash, range)
        self.writeTrToIndex(blockNumber, Buffer.from(getTr(previousTransaction).encoded, 'hex'), previousTxIndex)
        previousTxIndex = previousTxIndex.add(new BN(1))
        previousTransaction = transaction
      }).on('end', function (data) {
        const range = coinIdToBuffer(new BN(maxEnd).sub(previousTransaction.sumStart))
        const prevTxHash = sha3(Buffer.from(self.getUnsignedTransaction(previousTransaction).encoded, 'hex'))
        self.writeNode(blockNumber, 0, previousTxIndex, prevTxHash, range)
        self.writeTrToIndex(blockNumber, Buffer.from(getTr(previousTransaction).encoded, 'hex'), previousTxIndex)
        // Return the total number of leaves
        resolve(previousTxIndex.addn(1))
      }).on('error', function (err) {
        reject(err)
      })
    })
  }

  async getNearest (key) {
    const it = this.db.iterator({
      gte: key,
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

  async getIndex (blockNumber, trEncoding) {
    const index = await this.db.get(this.makeTrToIndexKey(blockNumber, trEncoding))
    return index
  }

  parseNodeValue (value) {
    return {
      hash: value.slice(0, 32),
      sum: new BN(value.slice(32))
    }
  }

  makeNodeKey (blockNumber, level, index) {
    return Buffer.concat([Buffer.from(NODE_DB_PREFIX), blockNumber, this.makeIndexId(level, index)])
  }

  makeTrToIndexKey (blockNumber, trEncoding) {
    return Buffer.concat([BLOCK_INDEX_PREFIX, blockNumber, trEncoding])
  }

  async writeNode (blockNumber, level, index, hash, sum) {
    const newNodeKey = this.makeNodeKey(blockNumber, level, index)
    log('Writing new node\nKey:', newNodeKey.toString('hex'), '\nValue:', Buffer.concat([Buffer.from(hash), sum]).toString('hex'))
    await this.db.put(newNodeKey, Buffer.concat([Buffer.from(hash), sum]))
  }

  async writeTrToIndex (blockNumber, trEncoding, index) {
    const newTrKey = this.makeTrToIndexKey(blockNumber, trEncoding)
    const indexBuff = index.toArrayLike(Buffer, 'big', INDEX_BYTES_SIZE)
    log('Writing new tr -> index\nKey:', newTrKey.toString('hex'), '\nValue:', indexBuff.toString('hex'))
    await this.db.put(newTrKey, indexBuff)
  }

  async writeNumLevels (blockNumber, numLevels) {
    log('Writing num levels for block:', Buffer.concat([NUM_LEVELS_PREFIX, blockNumber]), '\nWith value:', Buffer.from([numLevels]))
    await this.db.put(Buffer.concat([NUM_LEVELS_PREFIX, blockNumber]), Buffer.from([numLevels]))
  }

  async getNumLevels (blockNumber) {
    const numLevels = await this.db.get(Buffer.concat([NUM_LEVELS_PREFIX, blockNumber]))
    return new BN(numLevels)
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
    const leftSum = left.sum.toArrayLike(Buffer, 'big', 16)
    const rightSum = right.sum.toArrayLike(Buffer, 'big', 16)
    const parentHash = sha3(Buffer.concat([left.hash, leftSum, right.hash, rightSum]))
    return {
      hash: parentHash,
      sum: left.sum.add(right.sum).toArrayLike(Buffer, 'big', COIN_ID_BYTE_SIZE)
    }
  }

  async generateLevel (blockNumber, level, height) {
    log('Starting to generate level:', level, 'for block:', blockNumber.toString('hex'))
    const self = this
    const parentLevel = level + 1
    // Check that there is at least one node at this level--if not it might be an empty block
    try {
      await this.getNode(blockNumber, level, new BN(0))
    } catch (err) {
      // No node found! Is this an empty block?
      return this.emptyNode().hash
    }
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
        log('Processing child:', data.key.toString('hex'))
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
        // If level equals height, we have reached the root node.
        if (level === height) {
          log('Returning root hash:', Buffer.from(leftChild.hash).toString('hex'))
          await self.writeNumLevels(blockNumber, level)
          resolve(leftChild.hash)
          return
        }
        // Check if we ended on an element that wasn't a right node. If so fill it in with a blank node
        if (leftChild !== null) {
          log('Filling in an odd length level with a zero node')
          const rightChild = this.emptyNode()
          const parentNode = this.getParent(leftChild, rightChild)
          self.writeNode(blockNumber, parentLevel, parentIndex, parentNode.hash, parentNode.sum)
        }
        resolve(await self.generateLevel(blockNumber, parentLevel, height))
      }).on('error', (err) => {
        reject(err)
      })
    })
  }
}

module.exports = LevelDBSumTree
