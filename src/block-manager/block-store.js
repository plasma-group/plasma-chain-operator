const fs = require('fs')
const log = require('debug')('info:block-store')
const BN = require('web3').utils.BN
const makeBlockTxKey = require('../utils.js').makeBlockTxKey
const LevelDBSumTree = require('./leveldb-sum-tree.js')
const models = require('plasma-utils').serialization.models
const SignedTransaction = models.SignedTransaction
const Transfer = models.Transfer
const BLOCK_TX_PREFIX = require('../constants.js').BLOCK_TX_PREFIX
const BLOCK_ROOT_HASH_PREFIX = require('../constants.js').BLOCK_ROOT_HASH_PREFIX
const BLOCKNUMBER_BYTE_SIZE = require('../constants.js').BLOCKNUMBER_BYTE_SIZE
const TRANSFER_BYTE_SIZE = require('../constants.js').TRANSFER_BYTE_SIZE
const SIGNATURE_BYTE_SIZE = require('../constants.js').SIGNATURE_BYTE_SIZE
const itNext = require('../utils.js').itNext
const itEnd = require('../utils.js').itEnd
const defer = require('../utils.js').defer

class BlockStore {
  constructor (db, txLogDir) {
    log('Creating new block store')
    this.db = db
    this.sumTree = new LevelDBSumTree(this.db)
    this.txLogDir = txLogDir
    this.partialChunk = null
    this.batchPromises = []
    this.blockNumberBN = new BN(0) // Set block number to be -1 so that the first block is block 0
    this.newBlockQueue = []
  }

  async addBlock (txLogFile) {
    log('Adding new block:', txLogFile)
    const deferred = defer()
    this.newBlockQueue.push({ txLogFile, resolve: deferred.resolve })
    if (this.newBlockQueue.length === 1) {
      this._processNewBlockQueue()
    }
    return deferred.promise
  }

  async getRootHash (blockNumberBN) {
    const blockNumber = blockNumberBN.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
    const rootHash = await this.db.get(Buffer.concat([BLOCK_ROOT_HASH_PREFIX, blockNumber]))
    return rootHash
  }

  async _processNewBlockQueue () {
    let numBlocksProcessed
    for (numBlocksProcessed = 0; numBlocksProcessed < this.newBlockQueue.length; numBlocksProcessed++) {
      this.newBlockQueue[numBlocksProcessed].blockNumber = await this._processBlock(this.newBlockQueue[numBlocksProcessed].txLogFile)
    }
    const processedBlocks = this.newBlockQueue.splice(0, numBlocksProcessed)
    for (const processedBlock of processedBlocks) {
      processedBlock.resolve(processedBlock.blockNumber)
    }
  }

  async _processBlock (txLogFile) {
    const blockNumberBN = new BN(txLogFile)
    const blockNumber = blockNumberBN.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
    if (!this.blockNumberBN.add(new BN(1)).eq(blockNumberBN)) {
      throw new Error('Expected block number to be ' + this.blockNumberBN.add(new BN(1)).toString() + ' not ' + blockNumberBN.toString())
    }
    await this.ingestBlock(blockNumber, this.txLogDir + txLogFile)
    const rootHash = await this.sumTree.generateTree(blockNumber)
    this.db.put(Buffer.concat([BLOCK_ROOT_HASH_PREFIX, blockNumber]), rootHash)
    this.blockNumberBN = this.blockNumberBN.addn(1)
    log('Adding block number:', this.blockNumberBN.toString(), 'with root hash:', Buffer.from(rootHash).toString('hex'))
    return blockNumber
  }

  /*
   * History proof logic
   */
  async getLeavesAt (blockNumber, type, start, end) {
    const startKey = makeBlockTxKey(blockNumber, type, start)
    const endKey = makeBlockTxKey(blockNumber, type, end)
    const it = this.db.iterator({
      lt: endKey,
      reverse: true
    })
    let result = await this._getNextBlockTx(it)
    const ranges = [result]
    // Make sure that we returned values that we expect
    while (result.key > startKey) {
      result = await this._getNextBlockTx(it)
      ranges.push(result)
    }
    await itEnd(it)
    return ranges
  }

  async _getNextBlockTx (it) {
    const result = await itNext(it)
    if (result.key === undefined) {
      await itEnd(it)
      throw new Error('getLeavesAt iterator returned undefined!')
    }
    if (result.key[0] !== BLOCK_TX_PREFIX[0]) {
      await itEnd(it)
      throw new Error('Expected BLOCK_TX_PREFIX instead of ' + result.key[0])
    }
    return result
  }

  async getTransactions (startBlockNumberBN, endBlockNumberBN, type, start, end) {
    let blockNumberBN = startBlockNumberBN
    const relevantTransactions = []
    while (blockNumberBN.lte(endBlockNumberBN)) {
      const blockNumberKey = blockNumberBN.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
      const ranges = await this.getLeavesAt(blockNumberKey, type, start, end)
      relevantTransactions.push(ranges)
      blockNumberBN = blockNumberBN.add(new BN(1))
    }
    return relevantTransactions
  }

  async getProofsFor (blockNumber, type, start, end) {
    const getTr = (tx) => new Transfer(tx.transfers[tx.trIndex])
    const numLevels = await this.sumTree.getNumLevels(blockNumber)
    const leaves = await this.getLeavesAt(blockNumber, type, start, end)
    const allProofs = []
    for (const leaf of leaves) {
      const tx = this.sumTree.getTransactionFromLeaf(leaf.value)
      const trEncoding = Buffer.from(getTr(tx).encoded, 'hex')
      const index = await this.sumTree.getIndex(blockNumber, trEncoding)
      const inclusionProof = await this.getTransferInclusionProof(blockNumber, numLevels, new BN(index))
      const transferProof = {
        parsedSum: new BN(inclusionProof.includedNode.sum),
        transaction: tx,
        leafIndex: tx.trIndex,
        signature: tx.signatures[tx.trIndex],
        inclusionProof: inclusionProof.proof
      }
      allProofs.push(transferProof)
    }
    return allProofs
  }

  async getHistory (startBlockNumberBN, endBlockNumberBN, type, start, end) {
    let blockNumberBN = startBlockNumberBN
    const history = []
    while (blockNumberBN.lte(endBlockNumberBN)) {
      const blockNumberKey = blockNumberBN.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
      const proofs = await this.getProofsFor(blockNumberKey, type, start, end)
      history.push(proofs)
      blockNumberBN = blockNumberBN.add(new BN(1))
    }
    return history
  }

  async getTransferInclusionProof (blockNumber, numLevels, index) {
    const proof = []

    // Included node
    const includedNodeValue = await this.sumTree.getNode(blockNumber, 0, index)
    const includedNode = this.sumTree.parseNodeValue(includedNodeValue)

    let parentIndex
    let nodeValue
    let node
    let siblingIndex = index.addn((index.mod(new BN(2)).eq(new BN(0)) ? 1 : -1))
    for (let i = 0; i < numLevels; i++) {
      try {
        nodeValue = await this.sumTree.getNode(blockNumber, i, siblingIndex)
        node = this.sumTree.parseNodeValue(nodeValue)
      } catch (err) {
        if (err.type === 'NotFoundError') {
          log('Node not found in block tree! Treating it as an empty leaf...')
          nodeValue = undefined
          node = this.sumTree.emptyNode()
        } else throw err
      }
      proof.push({
        hash: node.hash,
        sum: node.sum
      })

      // Figure out the parent and then figure out the parent's sibling.
      parentIndex = siblingIndex.eq(new BN(0)) ? new BN(0) : siblingIndex.divn(2)
      siblingIndex = parentIndex.addn((parentIndex.mod(new BN(2)).eq(new BN(0)) ? 1 : -1))
    }
    return {
      includedNode,
      proof
    }
  }

  /*
   * Block ingestion logic
   */
  ingestBlock (blockNumber, txLogFilePath) {
    const self = this
    log('Generating new block for block:', blockNumber)
    const readStream = fs.createReadStream(txLogFilePath)
    readStream.on('data', function (chunk) {
      log('Read chunk of size:', chunk.length)
      self.parseTxBinary(blockNumber, chunk)
    })
    // Return a promise which resolves once the entire file has been read
    return new Promise((resolve, reject) => {
      readStream.on('end', (res) => {
        log('Finished reading all chunks')
        Promise.all(this.batchPromises).then(() => {
          log('Finished ingesting & sorting all chunks')
          resolve()
        })
      })
    })
  }

  readNextTransaction (cursor, chunk) {
    const numElements = new BN(chunk.slice(cursor + 4, cursor + 5)).toNumber()
    const transferSize = numElements * TRANSFER_BYTE_SIZE
    const signatureSize = numElements * SIGNATURE_BYTE_SIZE
    const txSize = BLOCKNUMBER_BYTE_SIZE + transferSize + signatureSize + 2 // We have two length identifiers, so plus 2
    // Check if this transaction is the very last in our chunk
    if (cursor + txSize > chunk.length) {
      // Set partial tx
      this.partialChunk = chunk.slice(cursor)
      return [null]
    }
    const txStart = cursor
    const txEnd = txStart + txSize
    // Make the transaction object
    const nextTransaction = new SignedTransaction(chunk.slice(txStart, txEnd).toString('hex'))
    log('Read new transaction')
    return [cursor + txSize, nextTransaction, chunk.slice(cursor, txEnd)]
  }

  parseTxBinary (blockNumber, chunk) {
    if (this.partialChunk != null) {
      chunk = Buffer.concat([this.partialChunk, chunk])
    }
    const txBundle = []
    let [cursor, nextTx, nextTxEncoding] = this.readNextTransaction(0, chunk)
    while (cursor !== null) {
      txBundle.push([nextTx, nextTxEncoding]);
      [cursor, nextTx, nextTxEncoding] = this.readNextTransaction(cursor, chunk)
    }
    this.storeTransactions(blockNumber, txBundle)
  }

  storeTransactions (blockNumber, txBundle) {
    // Ingest these transactions, into levelDB as `blocknum + typedStart +
    const dbBatch = []
    for (const tx of txBundle) {
      for (const [i, tr] of tx[0].transfers.entries()) {
        log('Storing tx at:', makeBlockTxKey(blockNumber, tr.token, tr.start))
        dbBatch.push({
          type: 'put',
          key: makeBlockTxKey(blockNumber, tr.token, tr.start),
          value: Buffer.concat([Buffer.from([i]), Buffer.from(tx[1])]) // Store as index of the TR & then transaction
        })
      }
    }
    this.batchPromises.push(this.db.batch(dbBatch))
  }
}

module.exports = BlockStore
