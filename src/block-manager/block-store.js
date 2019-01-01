const fs = require('fs')
const log = require('debug')('info:block-store')
const BN = require('../eth.js').utils.BN
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
  }

  generateBlock (txLogFile) {
    const self = this
    log('Generating new block based on path:', txLogFile)
    const blocknumber = new BN(txLogFile)
    const blocknumberKey = blocknumber.toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
    const readStream = fs.createReadStream(this.txLogDir + txLogFile)
    readStream.on('data', function (chunk) {
      log(chunk.length)
      self.parseTxBinary(blocknumberKey, chunk)
      // Read chunks
      // Encode every x bytes
      // Pull type, start & end
      // Sort -- pump into DB as `blocknum + typedStart +
      // Feed into plasma-sum-tree.PlasmaMerkleSumTree.parseLeaves
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
    return [cursor + txSize, nextTransaction]
  }

  parseTxBinary (blocknumber, chunk) {
    if (this.partialChunk != null) {
      chunk = Buffer.concat([this.partialChunk, chunk])
    }
    const txs = []
    let [cursor, nextTx] = this.makeNextTransaction(0, chunk)
    while (cursor !== null) {
      [cursor, nextTx] = this.makeNextTransaction(cursor, chunk)
      txs.push(nextTx)
    }
    log(txs.length)
  }
}

module.exports = BlockStore
