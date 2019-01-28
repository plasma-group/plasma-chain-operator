const fs = require('fs')
const log = require('debug')('info:block-store')
const BN = require('web3').utils.BN
const makeBlockTxKey = require('../utils.js').makeBlockTxKey
const LevelDBSumTree = require('./leveldb-sum-tree.js')
const models = require('plasma-utils').serialization.models
const UnsignedTransaction = models.UnsignedTransaction
const SignedTransaction = models.SignedTransaction
const Transfer = models.Transfer
const TransactionProof = models.TransactionProof
const BLOCK_TX_PREFIX = require('../constants.js').BLOCK_TX_PREFIX
const BLOCK_DEPOSIT_PREFIX = require('../constants.js').BLOCK_DEPOSIT_PREFIX
const BLOCK_ROOT_HASH_PREFIX = require('../constants.js').BLOCK_ROOT_HASH_PREFIX
const BLOCKNUMBER_BYTE_SIZE = require('../constants.js').BLOCKNUMBER_BYTE_SIZE
const TRANSFER_BYTE_SIZE = require('../constants.js').TRANSFER_BYTE_SIZE
const SIGNATURE_BYTE_SIZE = require('../constants.js').SIGNATURE_BYTE_SIZE
const itNext = require('../utils.js').itNext
const itEnd = require('../utils.js').itEnd
const defer = require('../utils.js').defer
const getCoinId = require('../utils.js').getCoinId

/* ******** HELPER FUNCTIONS ********** */
function getHexStringProof (proof) { // TODO: Remove this and instead support buffers by default
  let inclusionProof = []
  for (const sibling of proof) {
    inclusionProof.push(sibling.hash.toString('hex') + sibling.sum.toString('hex', 32))
  }
  return inclusionProof
}

function makeDepositKey (type, start) {
  return Buffer.concat([BLOCK_DEPOSIT_PREFIX, getCoinId(type, start)])
}

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

  async addDeposit (depositTx) {
    log('Adding new deposit for', depositTx.tr.recipient, 'with start:', depositTx.tr.start.toString(16), 'and end:', depositTx.tr.end.toString(16))
    // Store the deposit in our database in a similar way that we store normal transactions, by start position
    await this.db.put(makeDepositKey(depositTx.tr.token, depositTx.tr.start), Buffer.from(depositTx.encoded, 'hex'))
  }

  async getRootHash (blockNumberBN) {
    const blockNumber = blockNumberBN.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
    const rootHash = await this.db.get(Buffer.concat([BLOCK_ROOT_HASH_PREFIX, blockNumber]))
    return rootHash
  }

  async _processNewBlockQueue () {
    let numBlocksProcessed
    for (numBlocksProcessed = 0; numBlocksProcessed < this.newBlockQueue.length; numBlocksProcessed++) {
      this.newBlockQueue[numBlocksProcessed].newBlock = await this._processBlock(this.newBlockQueue[numBlocksProcessed].txLogFile)
    }
    const processedBlocks = this.newBlockQueue.splice(0, numBlocksProcessed)
    for (const processedBlock of processedBlocks) {
      processedBlock.resolve(processedBlock.newBlock)
    }
  }

  async _processBlock (txLogFile) {
    const blockNumberBN = new BN(txLogFile)
    const blockNumber = blockNumberBN.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
    if (!this.blockNumberBN.add(new BN(1)).eq(blockNumberBN)) {
      // TODO: After launch figure out why I was even storing block number in the first place....? Either store in DB or remove it.
      log('Warning: Expected block number to be ' + this.blockNumberBN.add(new BN(1)).toString() + ' not ' + blockNumberBN.toString())
    }
    await this.ingestBlock(blockNumber, this.txLogDir + txLogFile)
    const rootHash = await this.sumTree.generateTree(blockNumber)
    this.db.put(Buffer.concat([BLOCK_ROOT_HASH_PREFIX, blockNumber]), rootHash)
    this.blockNumberBN = this.blockNumberBN.addn(1)
    log('Adding block number:', blockNumberBN.toString(), 'with root hash:', Buffer.from(rootHash).toString('hex'))
    return {
      blockNumber,
      rootHash
    }
  }

  /*
   * History proof logic
   */
  async getLeavesAt (blockNumber, token, start, end) {
    const startKey = makeBlockTxKey(blockNumber, token, start)
    const endKey = makeBlockTxKey(blockNumber, token, end)
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

  async getDepositsAt (token, start, end) {
    const startKey = makeDepositKey(token, start)
    const endKey = makeDepositKey(token, end)
    const it = this.db.iterator({
      lt: endKey,
      reverse: true
    })
    let [result, deposit] = await this._getNextDeposit(it)
    const deposits = [deposit]
    let earliestBlock = new BN(deposit.block)
    // Make sure that we returned values that we expect
    while (result.key > startKey) {
      [result, deposit] = await this._getNextDeposit(it)
      deposits.push(deposit)
      if (earliestBlock.gt(deposit.block)) {
        earliestBlock = new BN(deposit.block)
      }
    }
    await itEnd(it)
    return [ deposits, earliestBlock ]
  }

  async _getNextDeposit (it) {
    const result = await itNext(it)
    if (result.key === undefined) {
      await itEnd(it)
      throw new Error('getDepositsAt iterator returned undefined!')
    }
    if (result.key[0] !== BLOCK_DEPOSIT_PREFIX[0]) {
      await itEnd(it)
      throw new Error('Expected BLOCK_DEPOSIT_PREFIX instead of ' + result.key[0])
    }
    const deposit = new UnsignedTransaction(result.value.toString('hex'))
    return [result, deposit]
  }

  async getTransactions (startBlockNumberBN, endBlockNumberBN, token, start, end, maxTransactions) {
    let blockNumberBN = startBlockNumberBN
    const relevantTransactions = []
    while (blockNumberBN.lte(endBlockNumberBN)) {
      const blockNumberKey = blockNumberBN.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
      const ranges = await this.getLeavesAt(blockNumberKey, token, start, end)
      for (const r of ranges) {
        const tx = await this.sumTree.getTransactionFromLeaf(r.value)
        relevantTransactions.push(tx)
      }
      blockNumberBN = blockNumberBN.add(new BN(1))
      if (maxTransactions !== undefined && relevantTransactions.length > maxTransactions) {
        return relevantTransactions
      }
    }
    return relevantTransactions
  }

  async getTxsWithProofsFor (blockNumber, token, start, end) {
    const numLevels = await this.sumTree.getNumLevels(blockNumber)
    const leaves = await this.getLeavesAt(blockNumber, token, start, end)
    const txProofs = []
    for (const leaf of leaves) {
      const transaction = this.sumTree.getTransactionFromLeaf(leaf.value)
      const transactionProof = await this.getTransactionInclusionProof(transaction, blockNumber, numLevels)
      txProofs.push({
        transaction,
        transactionProof
      })
    }
    return txProofs
  }

  async getTxsWithProofs (startBlockNumberBN, endBlockNumberBN, token, start, end) {
    let blockNumberBN = startBlockNumberBN
    const transactionProofs = {}
    while (blockNumberBN.lte(endBlockNumberBN)) {
      const blockNumberKey = blockNumberBN.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
      const proofs = await this.getTxsWithProofsFor(blockNumberKey, token, start, end)
      transactionProofs[blockNumberBN.toString()] = proofs
      blockNumberBN = blockNumberBN.add(new BN(1))
    }
    return transactionProofs
  }

  async getTxHistory (startBlockNumberBN, endBlockNumberBN, transaction) {
    let blockNumberBN = startBlockNumberBN
    // First get all of the deposits for each transaction
    let deposits = []
    const earliestBlocks = []
    for (const transfer of transaction.transfers) {
      const [transferDeposits, earliestBlock] = await this.getDepositsAt(transfer.token, transfer.start, transfer.end)
      // Get the earliest deposit & set the transfer `earliestDeposit` field to it
      deposits = deposits.concat(transferDeposits)
      earliestBlocks.push(earliestBlock)
    }
    const transactionHistory = {}
    while (blockNumberBN.lte(endBlockNumberBN)) {
      let proofs = []
      for (const [i, transfer] of transaction.transfers.entries()) {
        if (blockNumberBN.lte(earliestBlocks[i])) {
          log('Reached deposit end for transfer', i)
          // Stop retrieving proofs if we have reached the block which got the deposit for the transaction
          continue
        }
        // For each one of the transfer records get the proofs
        const blockNumberKey = blockNumberBN.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
        const rangeTxProof = await this.getTxsWithProofsFor(blockNumberKey, transfer.token, transfer.start, transfer.end)
        proofs = proofs.concat(rangeTxProof)
      }
      transactionHistory[blockNumberBN.toString()] = proofs
      blockNumberBN = blockNumberBN.add(new BN(1))
    }
    return {
      deposits,
      transactionHistory
    }
  }

  async getTransactionInclusionProof (transaction, blockNumber, numLevels) {
    const getTr = (tx, trIndex) => new Transfer(tx.transfers[trIndex])
    const transferProofs = []
    // For all transfers in our transaction, get transfer proof
    for (let i = 0; i < transaction.transfers.length; i++) {
      // First we need the index in the merkle sum tree of this leaf
      const trEncoding = Buffer.from(getTr(transaction, i).encoded, 'hex')
      const leafIndex = await this.sumTree.getIndex(blockNumber, trEncoding)
      // Now get the transfer inclusion proof
      const inclusionProof = await this.getTransferInclusionProof(blockNumber, numLevels, new BN(leafIndex))
      const trProof = {
        parsedSum: new BN(inclusionProof.includedNode.sum),
        transaction: transaction,
        leafIndex,
        signature: transaction.signatures[i],
        inclusionProof: getHexStringProof(inclusionProof.proof)
      }
      // Add it to our transaction proof
      transferProofs.push(trProof)
    }
    return new TransactionProof({transferProofs})
  }

  async getTransferInclusionProof (blockNumber, numLevels, index) {
    const proof = []

    // Included node
    const includedNodeValue = await this.sumTree.getNode(blockNumber, 0, index)
    const includedNode = this.sumTree.parseNodeValue(includedNodeValue)
    log('Included node hash:', includedNode.hash.toString('hex'), '--sum:', includedNode.sum.toString(16))

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
    let chunkNumber = 0
    readStream.on('data', function (chunk) {
      log('Read chunk of size:', chunk.length)
      self.parseTxBinary(blockNumber, chunk, chunkNumber)
      chunkNumber++
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

  parseTxBinary (blockNumber, chunk, chunkNumber) {
    if (this.partialChunk != null) {
      chunk = Buffer.concat([this.partialChunk, chunk])
    }
    const txBundle = []
    let [cursor, nextTx, nextTxEncoding] = this.readNextTransaction(0, chunk)
    while (cursor !== null) {
      txBundle.push([nextTx, nextTxEncoding]);
      [cursor, nextTx, nextTxEncoding] = this.readNextTransaction(cursor, chunk)
    }

    // Leftmost transfer of the first transaction in a block MUST start at zero.
    // We should probably get rid of this later on.
    if (chunkNumber === 0 && txBundle.length > 0) {
      const leftmost = txBundle[0][0].transfers.reduce((prev, curr) => {
        return prev.start < curr.start ? prev : curr
      })
      leftmost.start = new BN(0)
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
