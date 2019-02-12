const levelup = require('levelup')
const leveldown = require('leveldown')
const State = require('./state.js')
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
  // ******* INIT ******* //
  if (m.message.method === constants.INIT_METHOD) {
    await startup(m.message.params)
    process.send({ ipcID: m.ipcID, message: {startup: 'SUCCESS'} })
    return
  // ******* NEW_BLOCK ******* //
  } else if (m.message.method === constants.NEW_BLOCK_METHOD) {
    let response
    try {
      const blockNumber = await state.startNewBlock()
      response = { newBlockNumber: blockNumber.toString() }
    } catch (err) {
      error('Error in new block!\nrpcID:', m.message.id, '\nError message:', err, '\n')
      response = { error: err }
    }
    log('OUTGOING new block success with rpcID:', m.message.id)
    process.send({ ipcID: m.ipcID, message: { result: response } })
    return
  // ******* GET_BLOCK_NUMBER ******* //
  } else if (m.message.method === constants.GET_BLOCK_NUMBER_METHOD) {
    const blockNumber = state.blockNumber
    log('OUTGOING new block success with rpcID:', m.message.id)
    process.send({ ipcID: m.ipcID, message: { result: blockNumber.toString() } })
    return
  // ******* DEPOSIT ******* //
  } else if (m.message.method === constants.DEPOSIT_METHOD) {
    const deposit = await newDepositCallback(null, {
      recipient: Buffer.from(Web3.utils.hexToBytes(m.message.params.recipient)),
      token: new BN(m.message.params.token, 16),
      start: new BN(m.message.params.start, 16),
      end: new BN(m.message.params.end, 16)
    })
    log('OUTGOING new deposit with rpcID:', m.message.id)
    process.send({ ipcID: m.ipcID, message: { deposit } })
    return
  // ******* ADD_TX ******* //
  } else if (m.message.method === constants.ADD_TX_METHOD) {
    const tx = new SignedTransaction(m.message.params[0])
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
  // ******* GET_TXS ******* //
  } else if (m.message.method === constants.GET_TXS_METHOD) {
    let response
    try {
      const [address, startBlock, endBlock] = m.message.params
      const getTxResult = Array.from(await state.getTransactions(address, startBlock, endBlock))
      response = { result: getTxResult }
    } catch (err) {
      error('Error in getting past transactions!\nrpcID:', m.message.id, '\nError message:', err, '\n')
      response = { error: err }
    }
    log('OUTGOING getTransactions response with rpcID:', m.message.id)
    process.send({ ipcID: m.ipcID, message: response })
    return
  // ******* GET_RECENT_TXS ******* //
  } else if (m.message.method === constants.GET_RECENT_TXS_METHOD) {
    let response
    try {
      const [start, end] = m.message.params
      const recentTransactions = await state.getRecentTransactions(start, end)
      response = { result: recentTransactions }
    } catch (err) {
      error('Error getting recent transactions!\nrpcID:', m.message.id, '\nError message:', err, '\n')
      response = { error: err }
    }
    log('OUTGOING getRecentTransactions response with rpcID:', m.message.id)
    process.send({ ipcID: m.ipcID, message: response })
    return
  }
  process.send({ ipcID: m.ipcID, message: {error: 'RPC method not recognized!'} })
  error('RPC method', m.message.method, 'not recognized!')
})

async function newDepositCallback (err, deposit) {
  if (err) {
    throw err
  }
  return state.addDeposit(deposit.recipient, deposit.token, deposit.start, deposit.end)
}
