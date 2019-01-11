const levelup = require('levelup')
const leveldown = require('leveldown')
const State = require('./state.js').State
const web3 = require('../eth.js')
const constants = require('../constants.js')
const BN = web3.utils.BN
const encoder = require('plasma-utils').encoder
const log = require('debug')('info:state-app')
const error = require('debug')('ERROR:state-app')

// Create global state object
let state

async function startup (options) {
  const db = levelup(leveldown(options.dbDir))
  state = new State(db, options.txLogDir)
  await state.init()
}

process.on('message', async (m) => {
  log('INCOMING request with method:', m.message.method, 'and rpcID:', m.message.id)
  if (m.message.method === constants.INIT_METHOD) {
    await startup(m.message.params)
    return
  } else if (m.message.method === constants.NEW_BLOCK_METHOD) {
    const blockNumber = await state.startNewBlock()
    log('OUTGOING new block success with rpcID:', m.message.id)
    process.send({ ipcID: m.ipcID, message: {newBlockNumber: blockNumber.toString()} })
    return
  } else if (m.message.method === constants.DEPOSIT_METHOD) {
    const deposit = await newDepositCallback(null, {
      recipient: Buffer.from(web3.utils.hexToBytes(m.message.params.recipient)),
      type: new BN(m.message.params.type, 16),
      amount: new BN(m.message.params.amount, 16)
    })
    log('OUTGOING new deposit with rpcID:', m.message.id)
    process.send({ ipcID: m.ipcID, message: deposit })
    return
  } else if (m.message.method === constants.ADD_TX_METHOD) {
    // New transaction!
    const tx = new encoder.Transaction(m.message.params.encodedTx)
    let txResponse
    try {
      const addTxResult = await state.addTransaction(tx)
      txResponse = { result: addTxResult }
    } catch (err) {
      error('Error in adding transaction!\nrpcID:', m.message.id, '\nError message:', err, '\n')
      txResponse = { error: err }
    }
    log('OUTGOING addTransaction response with rpcID:', m.message.id)
    process.send({ ipcID: m.ipcID, message: txResponse })
    return
  }
  throw new Error('RPC method not recognized!')
})

async function newDepositCallback (err, depositEvent) {
  if (err) {
    throw err
  }
  return state.addDeposit(depositEvent.recipient, depositEvent.type, depositEvent.amount)
}
