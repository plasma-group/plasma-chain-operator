const levelup = require('levelup')
const leveldown = require('leveldown')
const State = require('./state.js').State
const web3 = require('../eth.js')
const BN = web3.utils.BN
const log = require('debug')('info:state-app')

// Create global state object
let state

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))
async function startup () {
  const db = levelup(leveldown('./db'))
  log('New db:', db)
  const s = new State(db, './db/tx_log/')
  await s.init()
  state = s
}
startup()

process.on('message', async (m) => {
  while (state === undefined) { // eslint-disable-line no-unmodified-loop-condition
    log('State not initialized yet... waiting...')
    await timeout(5)
  }
  log('CHILD got req body:', m.body)
  await newDepositCallback(null, {
    recipient: Buffer.from(web3.utils.hexToBytes(m.message.params.recipient)),
    type: new BN(m.message.params.type, 16),
    amount: new BN(m.message.params.amount, 16)
  })
  process.send({ id: m.id, message: 'SUCESS' })
})

async function newDepositCallback (err, depositEvent) {
  if (err) {
    throw err
  }
  state.addDeposit(depositEvent.recipient, depositEvent.type, depositEvent.amount)
}
