const web3 = require('../src/eth.js')

// Generate a bunch of private keys
const privateKeys = []
for (let i = 0; i < 100; i++) {
  privateKeys.push(web3.utils.sha3(i.toString()))
}
// Generate a bunch of accounts
const accounts = []
for (const privateKey of privateKeys) {
  accounts.push(web3.eth.accounts.privateKeyToAccount(privateKey))
}

// Generate a sample transaction
const sampleTr = {
  sender: accounts[0].address,
  recipient: accounts[1].address,
  type: new web3.utils.BN('0'),
  start: new web3.utils.BN('10'),
  offset: new web3.utils.BN('1'),
  block: new web3.utils.BN('0')
}

const sig = {
  v: new web3.utils.BN('0'),
  r: new web3.utils.BN('0'),
  s: new web3.utils.BN('0')
}

const testTx = {
  transferRecords: [sampleTr],
  signatures: [sig]
}

module.exports = {
  accounts,
  testTx
}
