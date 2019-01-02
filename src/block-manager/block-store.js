const fs = require('fs')
const log = require('debug')('info:block-store')
const BN = require('../eth.js').utils.BN
const getCoinId = require('../utils.js').getCoinId
const encoder = require('plasma-utils').encoder
const BLOCKNUMBER_BYTE_SIZE = require('../constants.js').BLOCKNUMBER_BYTE_SIZE
const TRANSFER_BYTE_SIZE = require('../constants.js').TRANSFER_BYTE_SIZE
const SIGNATURE_BYTE_SIZE = require('../constants.js').SIGNATURE_BYTE_SIZE

class BlockStore {
  constructor (db, txLogDir) {
    log('Creating new block store')
    this.db = db
    this.txLogDir = txLogDir
    this.partialChunk = null
    this.batchPromises = []
  }

  ingestBlock (txLogFile) {
    const self = this
    log('Generating new block based on path:', txLogFile)
    const blocknumber = new BN(txLogFile)
    const blocknumberKey = blocknumber.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
    const readStream = fs.createReadStream(this.txLogDir + txLogFile)
    readStream.on('data', function (chunk) {
      log('Read chunk of size:', chunk.length)
      self.parseTxBinary(blocknumberKey, chunk)
    })
    // Return a promise which resolves once the entire file has been read
    return new Promise((resolve, reject) => {
      readStream.on('end', (res) => {
        log('Finished reading all chunks')
        Promise.all(this.batchPromises).then(() => {
          resolve()
          log('Finished ingesting & sorting all chunks')
        })
      })
    })
  }

  makeNextTransaction (cursor, chunk) {
    const numElements = new BN(chunk.slice(cursor, cursor + 1)).toNumber()
    const transferSize = numElements * TRANSFER_BYTE_SIZE
    const signatureSize = numElements * SIGNATURE_BYTE_SIZE
    const txSize = transferSize + signatureSize + 8 // We have two length identifiers, both length 4, so add 8
    // Check if this transaction is the very last in our chunk
    if (cursor + txSize > chunk.length) {
      // Set partial tx
      this.partialChunk = chunk.slice(cursor)
      return [null]
    }
    const trStart = cursor
    const trEnd = trStart + 4 + transferSize
    const sigStart = trEnd
    const sigEnd = sigStart + 4 + signatureSize
    // Make the transaction object
    const trList = new encoder.TRList([...chunk.slice(trStart, trEnd)])
    const sigList = new encoder.SigList([...chunk.slice(sigStart, sigEnd)])
    const nextTransaction = new encoder.Transaction(trList, sigList)
    return [cursor + txSize, nextTransaction, chunk.slice(cursor, sigEnd)]
  }

  parseTxBinary (blocknumber, chunk) {
    if (this.partialChunk != null) {
      chunk = Buffer.concat([this.partialChunk, chunk])
    }
    const txBundle = []
    let [cursor, nextTx, nextTxEncoding] = this.makeNextTransaction(0, chunk)
    while (cursor !== null) {
      txBundle.push([nextTx, nextTxEncoding]);
      [cursor, nextTx, nextTxEncoding] = this.makeNextTransaction(cursor, chunk)
    }
    this.storeTransactions(blocknumber, txBundle)
  }

  storeTransactions (blocknumber, txBundle) {
    // Ingest these transactions, into levelDB as `blocknum + typedStart +
    const dbBatch = []
    for (const tx of txBundle) {
      for (const [i, tr] of tx[0].transferRecords.elements.entries()) {
        dbBatch.push({
          type: 'put',
          key: Buffer.concat([blocknumber, getCoinId(tr.type, tr.start)]),
          value: Buffer.concat([Buffer.from([i]), Buffer.from(tx[1])]) // Store as index of the TR & then transaction
        })
      }
    }
    this.batchPromises.push(this.db.batch(dbBatch))
  }
}

module.exports = BlockStore
