const Web3 = require('web3')
const web3 = new Web3('ws://localhost:8546')
const BigNumber = require('bignumber.js')

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
console.log(accounts)

// Generate a sample transaction
const sampleTr = {
  sender: accounts[0].address,
  recipient: accounts[1].address,
  type: BigNumber('0'),
  start: BigNumber('10'),
  offset: BigNumber('1'),
  block: BigNumber('0')
}

const sig = {
  v: BigNumber('0'),
  r: BigNumber('0'),
  s: BigNumber('0')
}

const tx = {
  transferRecords: [sampleTr],
  signatures: [sig]
}

console.log(tx)
