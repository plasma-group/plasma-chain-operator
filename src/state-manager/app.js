const levelup = require('levelup')
const leveldown = require('leveldown')
const State = require('./state.js').State
const web3 = require('../eth.js')
const constants = require('../constants.js')
const BN = web3.utils.BN
const log = require('debug')('info:state-app')

// Create global state object
let state

async function startup (options) {
  const db = levelup(leveldown(options.dbDir))
  state = new State(db, options.txLogDir)
  await state.init()
}

process.on('message', async (m) => {
  log('State got request:', m.message)
  if (m.message.method === constants.INIT_METHOD) {
    await startup(m.message.params)
  } else if (m.message.method === constants.DEPOSIT_METHOD) {
    const deposit = await newDepositCallback(null, {
      recipient: Buffer.from(web3.utils.hexToBytes(m.message.params.recipient)),
      type: new BN(m.message.params.type, 16),
      amount: new BN(m.message.params.amount, 16)
    })
    process.send({ id: m.id, message: deposit })
    return
  } else {
    throw new Error('RPC method not recognized!')
  }
  process.send({ id: m.id, message: 'SUCESS' })
})

async function newDepositCallback (err, depositEvent) {
  if (err) {
    throw err
  }
  return state.addDeposit(depositEvent.recipient, depositEvent.type, depositEvent.amount)
}
