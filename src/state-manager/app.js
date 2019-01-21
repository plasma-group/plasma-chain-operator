const levelup = require('levelup')
const leveldown = require('leveldown')
const State = require('./state.js').State
const Web3 = require('web3')
const constants = require('../constants.js')
const BN = Web3.utils.BN
const log = require('debug')('info:state-app')
const error = require('debug')('ERROR:state-app')
const models = require('plasma-utils').serialization.models
const SignedTransaction = models.SignedTransaction

// Create global state object
let state

async function startup (options) {
  const db = levelup(leveldown(options.stateDBDir))
  state = new State(db, options.txLogDir)
  await state.init()
}

process.on('message', async (m) => {
  log('INCOMING request with method:', m.message.method, 'and rpcID:', m.message.id)
  if (m.message.method === constants.INIT_METHOD) {
    await startup(m.message.params)
    process.send({ ipcID: m.ipcID, message: {startup: 'SUCCESS'} })
    return
  } else if (m.message.method === constants.NEW_BLOCK_METHOD) {
    const blockNumber = await state.startNewBlock()
    log('OUTGOING new block success with rpcID:', m.message.id)
    process.send({ ipcID: m.ipcID, message: {newBlockNumber: blockNumber.toString()} })
    return
  } else if (m.message.method === constants.DEPOSIT_METHOD) {
    const deposit = await newDepositCallback(null, {
      recipient: Buffer.from(Web3.utils.hexToBytes(m.message.params.recipient)),
      token: new BN(m.message.params.token, 16),
      amount: new BN(m.message.params.amount, 16)
    })
    log('OUTGOING new deposit with rpcID:', m.message.id)
    process.send({ ipcID: m.ipcID, message: { deposit } })
    return
  } else if (m.message.method === constants.ADD_TX_METHOD) {
    // New SignedTransaction!
    const tx = new SignedTransaction(m.message.params.encodedTx)
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
  return state.addDeposit(depositEvent.recipient, depositEvent.token, depositEvent.amount)
}
