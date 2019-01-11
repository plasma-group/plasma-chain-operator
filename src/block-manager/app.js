const levelup = require('levelup')
const leveldown = require('leveldown')
const BlockStore = require('./block-store.js')
const log = require('debug')('info:block-app')
const constants = require('../constants.js')

// Create global state object
let blockStore

async function startup (options) {
  const db = levelup(leveldown(options.dbDir))
  blockStore = new BlockStore(db, options.txLogDir)
}

process.on('message', async (m) => {
  log('Block manager got request:', m.message)
  if (m.message.method === constants.INIT_METHOD) {
    await startup(m.message.params)
  } else if (m.message.method === constants.NEW_BLOCK_METHOD) {
    const isSuccessfullyStarted = await blockStore.ingestBlock(m.message)
    if (!isSuccessfullyStarted) {
      process.send({ ipcID: m.ipcID, message: 'FAIL' })
    }
  } else {
    throw new Error('RPC method not recognized!')
  }
  process.send({ ipcID: m.ipcID, message: 'SUCESS' })
})

// TODO: Add a watcher which watches the tx-log for new files and calls `blockStore.addBlock()` with the new block file every time one is added.
