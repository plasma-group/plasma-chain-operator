const levelup = require('levelup')
const leveldown = require('leveldown')
// const web3 = require('../eth.js')
// const BN = web3.utils.BN

// 1) Create our store
var db = levelup(leveldown('./state-db'))
console.log('New db:', db)

// 2) Put a key & value
process.on('message', (m) => {
  console.log('CHILD got req body:', m.body)
  // newDepositCallback(null, {
  //   recipient: Buffer.from(web3.utils.hexToBytes(m.body.params.recipient)),
  //   type: new BN(m.body.params.type, 16),
  //   amount: new BN(m.body.params.amount, 16)
  // })
  setTimeout(() => { process.send({ id: m.id, foo: 'bar' }) }, 1000)
})

// function newDepositCallback (err, depositEvent) {
//   if (err) {
//     throw err
//   }
// }
