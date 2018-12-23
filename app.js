const levelup = require('levelup')
const leveldown = require('leveldown')
const State = require('./state.js')
const constants = require('./constants.js')
const BN = require('./eth.js').utils.BN
const express = require('express')
const bodyParser = require('body-parser')

// Set up express
const app = express()
const port = 3000

app.use(bodyParser.json())

// Handle incoming transactions
app.post('/api', function (req, res) {
  console.log('Request body: \n', req.body)
  if (req.body.method === constants.DEPOSIT_METHOD) {
    newDepositCallback(null, {
      recipient: req.body.params.recipient,
      type: new BN(req.body.params.type, 16),
      amount: new BN(req.body.params.amount, 16)
    })
  }
  res.send('POST request success')
})

// Handle new deposit -- Use something like the following code when we aren't just mocking the smart contract
// plasmaContract.events.deposit({
//     filter: {myIndexedParam: [20,23], myOtherIndexedParam: '0x123456789...'}, // Using an array means OR: e.g. 20 or 23
//     fromBlock: 0
// }, newDepositCallback)

function newDepositCallback (err, newDepositEvent) {
  if (err) {
    throw err
  }
  // Add new deposit
  console.log('new deposit!', newDepositEvent)
}

async function startup () {
  const db = levelup(leveldown('./db'))
  const state = new State(db)
  await state.init()
  // Begin listening for connections
  app.listen(port, () => console.log(`Operator listening on port ${port}!`))
}
startup()

module.exports = app
