const log = require('debug')('info:block-app')
const error = require('debug')('ERROR:block-manager-app')
const fs = require('fs')
const levelup = require('levelup')
const leveldown = require('leveldown')
const BlockStore = require('./block-store.js')
const SignedTransaction = require('plasma-utils').serialization.models.SignedTransaction
const constants = require('../constants.js')
const getDepositTransaction = require('../utils.js').getDepositTransaction
const BN = require('web3').utils.BN

// Create global state object
let blockStore

async function startup (options) {
  log('Starting block manager')
  const db = levelup(leveldown(options.blockDBDir))
  blockStore = new BlockStore(db, options.txLogDir)
  // Add a watcher which watches the tx-log for new files and calls `blockStore.addBlock()` with the new block file every time one is added.
  fs.watch(options.txLogDir, { encoding: 'utf8' }, async (eventType, filename) => {
    if (!filename || filename === 'tmp-tx-log.bin') {
      log('Directory change but filename is', filename)
      return
    }
    log('Adding new block:', filename)
    try {
      const newBlock = await blockStore.addBlock(filename)
      log('Successfully added block:', filename)
      process.send({ ipcID: -1, message: { rootHash: Buffer.from(newBlock.rootHash, 'hex').toString('hex') } })
    } catch (err) {
      log('FAILED to add block:', filename, 'with error:', err)
      throw err
    }
  })
}

process.on('message', async (m) => {
  log('Block manager got request:', m.message)
  if (m.message.method === constants.INIT_METHOD) {
    await startup(m.message.params)
    process.send({ ipcID: m.ipcID, message: {startup: 'SUCCESS'} })
    return
  // ******* NEW_BLOCK ******* //
  } else if (m.message.method === constants.NEW_BLOCK_METHOD) {
    const isSuccessfullyStarted = await blockStore.ingestBlock(m.message)
    if (!isSuccessfullyStarted) {
      process.send({ ipcID: m.ipcID, message: 'FAIL' })
      return
    } else throw new Error('BlockStore failed to ingest block!')
  // ******* DEPOSIT ******* //
  } else if (m.message.method === constants.DEPOSIT_METHOD) {
    let addDepositRes
    try {
      // owner, token, start, end, block
      const depositTx = getDepositTransaction(m.message.params.recipient, new BN(m.message.params.token, 16), new BN(m.message.params.start, 16), new BN(m.message.params.end, 16))
      addDepositRes = await blockStore.addDeposit(depositTx)
    } catch (err) {
      error('Error in adding transaction!\nrpcID:', m.message.id, '\nError message:', err, '\n')
      addDepositRes = { error: err }
    }
    process.send({ ipcID: m.ipcID, message: { addDepositRes } })
    return
  // ******* GET_HISTORY_PROOF ******* //
  } else if (m.message.method === constants.GET_HISTORY_PROOF) {
    const startBlockBN = new BN(m.message.params[0], 'hex')
    const endBlockBN = new BN(m.message.params[1], 'hex')
    const transaction = new SignedTransaction(m.message.params[2])
    let response
    try {
      const txsAndProofs = await blockStore.getTxHistory(startBlockBN, endBlockBN, transaction)
      response = { result: txsAndProofs }
    } catch (err) {
      console.error('Error in adding transaction!\nrpcID:', m.message.id, '\nError message:', err, '\n')
      response = { error: err }
    }
    log('OUTGOING getHistoryProof with rpcID:', m.message.id)
    process.send({ ipcID: m.ipcID, message: response })
    return
  }
  process.send({ ipcID: m.ipcID, message: {error: 'RPC method not recognized!'} })
  error('RPC method', m.message.method, 'not recognized!')
})
