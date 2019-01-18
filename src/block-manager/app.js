const fs = require('fs')
const levelup = require('levelup')
const leveldown = require('leveldown')
const BlockStore = require('./block-store.js')
const log = require('debug')('info:block-app')
const constants = require('../constants.js')

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
    const isSuccessfullyStarted = await blockStore.addBlock(filename)
    if (isSuccessfullyStarted) {
      log('Successfully added block:', filename)
    } else {
      log('FAILED to add block:', filename)
    }
  })
}

process.on('message', async (m) => {
  log('Block manager got request:', m.message)
  if (m.message.method === constants.INIT_METHOD) {
    await startup(m.message.params)
    process.send({ ipcID: m.ipcID, message: {startup: 'SUCCESS'} })
    return
  } else if (m.message.method === constants.NEW_BLOCK_METHOD) {
    const isSuccessfullyStarted = await blockStore.ingestBlock(m.message)
    if (!isSuccessfullyStarted) {
      process.send({ ipcID: m.ipcID, message: 'FAIL' })
      return
    } else throw new Error('BlockStore failed to ingest block!')
  }
  throw new Error('RPC method not recognized!')
})
